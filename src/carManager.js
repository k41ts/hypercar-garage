import * as THREE from 'three'
import gsap from 'gsap'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const SWAP_DURATION = 0.9

/**
 * Ngurusin load, normalisasi, dan pergantian model mobil.
 *
 * Cuma satu mobil yang ada di scene dalam satu waktu. Model di-load pas mau
 * dipakai (lazy), terus di-cache biar scroll balik ke atas gak load ulang.
 */
export class CarManager {
  constructor(garage, cars, { onProgress } = {}) {
    this.garage = garage
    this.cars = cars
    this.onProgress = onProgress

    this.activeIndex = -1
    this.idleSpin = 0

    this.root = new THREE.Group()
    garage.stage.add(this.root)

    this.entries = cars.map(() => ({ pivot: null, promise: null, materials: null }))

    this._initLoader()
  }

  _initLoader() {
    const draco = new DRACOLoader().setDecoderPath('/decoders/draco/')
    const ktx2 = new KTX2Loader()
      .setTranscoderPath('/decoders/basis/')
      .detectSupport(this.garage.renderer)

    this.loader = new GLTFLoader()
      .setDRACOLoader(draco)
      .setKTX2Loader(ktx2)
      .setMeshoptDecoder(MeshoptDecoder)
  }

  /**
   * Sebagian model Sketchfab dijual sepaket sama alas pajangannya — lantai,
   * cakram, turntable. Kalau gak dibuang, bounding box-nya ngukur si alas dan
   * mobilnya jadi kekecilan pas dinormalisasi. Selain itu alasnya nabrak lantai
   * garasi kita sendiri.
   */
  _stripExtras(root, config) {
    if (!config.exclude?.length) return

    const doomed = []
    root.traverse((child) => {
      if (config.exclude.includes(child.name)) doomed.push(child)
    })

    for (const node of doomed) {
      node.traverse((child) => {
        if (!child.isMesh) return
        child.geometry?.dispose()
        const list = Array.isArray(child.material) ? child.material : [child.material]
        list.forEach((material) => material?.dispose())
      })
      node.removeFromParent()
    }
  }

  /**
   * Sketchfab mecah mobil jadi ratusan mesh terpisah — Ferrari ini aja 1.097,
   * artinya 1.097 draw call tiap frame. Geometri yang sematerial digabung jadi
   * satu, jadi tinggal belasan draw call. Ini penghematan terbesar buat GPU
   * terintegrasi.
   *
   * Aman karena mobilnya statis: gak ada bagian yang dianimasiin terpisah.
   */
  _mergeByMaterial(root) {
    root.updateMatrixWorld(true)
    const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert()

    const groups = new Map()
    root.traverse((child) => {
      // mesh multi-material atau ber-skinning dilewatin, penggabungannya rumit
      if (!child.isMesh || Array.isArray(child.material) || child.isSkinnedMesh) return
      if (child.morphTargetInfluences?.length) return

      const list = groups.get(child.material)
      if (list) list.push(child)
      else groups.set(child.material, [child])
    })

    for (const [material, meshes] of groups) {
      if (meshes.length < 2) continue

      const geometries = meshes.map((mesh) =>
        mesh.geometry
          .clone()
          .applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld))
      )

      // gagal kalau set atribut antar-geometri beda; kalau gitu ya biarin apa adanya
      let merged = null
      try {
        merged = mergeGeometries(geometries, false)
      } catch {
        merged = null
      }

      geometries.forEach((geometry) => geometry.dispose())
      if (!merged) continue

      for (const mesh of meshes) {
        mesh.geometry.dispose()
        mesh.removeFromParent()
      }
      root.add(new THREE.Mesh(merged, material))
    }
  }

  /**
   * Bikin model dari Sketchfab jadi ukuran & posisi yang konsisten:
   * panjangnya diseragamkan, titik tengahnya di origin, dan bannya nempel lantai.
   */
  _normalize(root, config) {
    const box = new THREE.Box3().setFromObject(root)
    const size = box.getSize(new THREE.Vector3())

    // sumbu terpanjang = panjang mobil. Diputer biar selalu ngarah ke sumbu Z.
    if (size.x > size.z) {
      root.rotation.y += Math.PI / 2
      root.updateMatrixWorld(true)
      box.setFromObject(root)
      box.getSize(size)
    }

    const scale = config.targetLength / Math.max(size.x, size.y, size.z)
    root.scale.multiplyScalar(scale)
    root.updateMatrixWorld(true)

    box.setFromObject(root)
    const center = box.getCenter(new THREE.Vector3())
    root.position.x -= center.x
    root.position.z -= center.z
    root.position.y -= box.min.y
  }

  _prepareMaterials(root) {
    const materials = new Set()

    root.traverse((child) => {
      if (!child.isMesh) return

      child.castShadow = true
      child.receiveShadow = true

      const list = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of list) {
        if (!material || materials.has(material)) continue
        materials.add(material)
        material.envMapIntensity = 1.15

        // Material dua sisi yang transparan dirender DUA KALI sama Three (muka
        // belakang dulu, baru depan). Transisi ganti mobil bikin semua material
        // jadi transparan sesaat, jadi tanpa ini biaya render melonjak 4x persis
        // di momen paling sibuk. Bedanya cuma di urutan tumpukan kaca — nyaris
        // gak kelihatan di ruangan gelap.
        material.forceSinglePass = true

        // Material kaca bawaan Sketchfab pakai `transmission`. Buat itu Three
        // nge-render ULANG seluruh scene ke render target terpisah — biaya per
        // frame langsung dobel. Di garasi gelap gini efeknya nyaris gak kelihatan,
        // jadi dimatiin; kacanya tetep bening lewat opacity biasa.
        if (material.transmission > 0) {
          material.transmission = 0
          material.transparent = true
          material.needsUpdate = true
        }
        material.userData.baseTransparent = material.transparent
        material.userData.baseOpacity = material.opacity
        material.userData.baseDepthWrite = material.depthWrite
      }
    })

    return materials
  }

  /** Fade in/out dengan cara nge-set opacity semua material sekaligus. */
  _setOpacity(entry, value) {
    const opaque = value >= 0.999
    for (const material of entry.materials) {
      material.transparent = opaque ? material.userData.baseTransparent : true
      material.opacity = opaque ? material.userData.baseOpacity : value
      material.depthWrite = opaque ? material.userData.baseDepthWrite : false
    }
  }

  load(index) {
    const entry = this.entries[index]
    if (entry.promise) return entry.promise

    const config = this.cars[index].model

    entry.promise = new Promise((resolve, reject) => {
      this.loader.load(
        config.url,
        (gltf) => {
          const model = gltf.scene
          this._stripExtras(model, config)
          this._mergeByMaterial(model)
          this._normalize(model, config)

          const pivot = new THREE.Group()
          pivot.add(model)
          pivot.visible = false

          entry.pivot = pivot
          entry.materials = this._prepareMaterials(model)
          this.root.add(pivot)
          resolve(pivot)
        },
        (event) => {
          if (this.onProgress && event.lengthComputable) {
            this.onProgress(index, event.loaded / event.total)
          }
        },
        reject
      )
    })

    return entry.promise
  }

  /** Load model berikutnya di background biar transisinya gak nunggu lama. */
  prefetch(index) {
    if (index >= 0 && index < this.cars.length) this.load(index)
  }

  /**
   * Muat sisa mobilnya pas browser lagi nganggur, bukan pas lagi discroll.
   *
   * Decode Draco dan penggabungan mesh itu kerjaan berat yang jalan di main
   * thread. Kalau dipicu waktu mobil berikutnya mau muncul, hentakannya
   * mendarat persis di tengah gerakan kamera — dan di situ paling kelihatan.
   * Dijalanin pas nganggur bikin hentakannya jatuh waktu orang masih baca
   * bagian pembuka, jadi transisinya nanti mulus.
   *
   * Dimuat satu per satu, biar gak rebutan CPU sama frame yang lagi jalan.
   */
  prefetchAll() {
    const whenIdle =
      window.requestIdleCallback?.bind(window) ?? ((fn) => setTimeout(fn, 400))

    let index = 1
    const loadNext = () => {
      if (index >= this.cars.length) return
      this.load(index++).finally(() => whenIdle(loadNext))
    }

    whenIdle(loadNext)
  }

  _fade(entry, to, duration, ease, onComplete) {
    const state = entry.fadeState ?? (entry.fadeState = { v: 0 })
    gsap.killTweensOf(state)
    gsap.to(state, {
      v: to,
      duration,
      ease,
      onUpdate: () => this._setOpacity(entry, state.v),
      onComplete,
    })
  }

  _hide(entry) {
    gsap.killTweensOf(entry.pivot.position)
    gsap.to(entry.pivot.position, { x: -2.2, duration: SWAP_DURATION, ease: 'power2.in' })
    this._fade(entry, 0, SWAP_DURATION * 0.75, 'power2.in', () => {
      entry.pivot.visible = false
    })
  }

  async show(index) {
    if (index === this.activeIndex || index < 0 || index >= this.cars.length) return

    const previousIndex = this.activeIndex
    this.activeIndex = index

    this.garage.setAccent(this.cars[index].accent)

    const pivot = await this.load(index)

    // scroll bisa jalan terus selama model masih di-load — kalau target udah
    // berubah pas load selesai, batalin biar gak nyalip mobil yang bener
    if (this.activeIndex !== index) return

    const previous = previousIndex >= 0 ? this.entries[previousIndex] : null
    if (previous?.pivot?.visible) this._hide(previous)

    const entry = this.entries[index]
    pivot.visible = true
    if (entry.fadeState) entry.fadeState.v = 0

    // Mobil pertama gak perlu meluncur masuk — gak ada yang digantiin. Kalau
    // tetep dianimasiin, dia nangkring di luar layar sampai tween-nya jalan;
    // dan kalau halaman kebuka dalam keadaan gak kelihatan, rAF beku dan mobilnya
    // gak pernah nyampe tengah.
    const isFirst = previousIndex < 0
    gsap.killTweensOf(pivot.position)
    pivot.position.x = isFirst ? 0 : 2.2
    this._setOpacity(entry, isFirst ? 1 : 0)

    if (isFirst) {
      if (entry.fadeState) entry.fadeState.v = 1
    } else {
      gsap.to(pivot.position, { x: 0, duration: SWAP_DURATION, ease: 'power3.out' })
      this._fade(entry, 1, SWAP_DURATION, 'power2.out')
    }

    this.prefetch(index + 1)
  }

  /**
   * Mobilnya sengaja hampir diam total — kameranya yang gerak.
   *
   * Objek yang muter di tempat itu bahasa video game. Di film, mobil parkir diam
   * dan kamera yang ngelilingin. Yang disisain cuma geser sangat pelan biar
   * pantulan di catnya ikut bergerak — tanpa itu, bodinya kelihatan kayak foto
   * mati, bukan logam.
   */
  update(dt) {
    this.idleSpin += dt

    const entry = this.entries[this.activeIndex]
    if (!entry?.pivot) return

    // Ayunan TERBATAS (±2°), bukan putaran yang numpuk terus.
    //
    // Versi sebelumnya nambahin sudut tiap frame tanpa batas. Kelihatan aman
    // karena pelan banget, tapi setelah semenit mobilnya udah muter puluhan
    // derajat — dan semua shot close-up yang disusun buat mobil menghadap +Z
    // jadi nembus masuk ke dalam bodi.
    const sway = Math.sin(this.idleSpin * 0.22) * 0.035
    const target = this.cars[this.activeIndex].model.rotationOffset + sway
    entry.pivot.rotation.y += (target - entry.pivot.rotation.y) * (1 - Math.pow(0.02, dt))
  }
}
