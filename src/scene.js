import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

const BG_COLOR = 0x05060a

/**
 * Lapisan akhir ala film: grain, vignette, dan sedikit color grading.
 *
 * Gambar 3D yang bersih sempurna justru kelihatan "komputer". Grain halus dan
 * pinggiran yang gelap itu jejak kamera film beneran — otak kita langsung baca
 * gambarnya sebagai rekaman, bukan render.
 */
const FILM_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    // Grain sengaja tipis. Di bodi mobil gelap, grain yang kekencengan kebaca
    // sebagai noise/kotor, bukan tekstur film.
    uGrain: { value: 0.03 },
    uVignette: { value: 1.05 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrain;
    uniform float uVignette;
    varying vec2 vUv;

    float hash( vec2 p ) {
      return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
    }

    void main() {
      vec3 color = texture2D( tDiffuse, vUv ).rgb;

      // bayangan digeser ke biru dingin, highlight ke hangat — grading klasik
      // yang bikin logam kelihatan mahal
      float luma = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
      color = mix( color * vec3( 0.955, 0.982, 1.045 ), color * vec3( 1.025, 1.005, 0.975 ), luma );

      // kontras dinaikin tipis aja — kalau kekencengan, gradasi halus di bodi
      // mobil putus dan malah kelihatan digital
      color = ( color - 0.5 ) * 1.035 + 0.5;

      vec2 d = vUv - 0.5;
      float vignette = 1.0 - dot( d, d ) * uVignette;
      color *= clamp( vignette, 0.0, 1.0 );

      float grain = hash( vUv + fract( uTime ) ) - 0.5;
      color += grain * uGrain;

      gl_FragColor = vec4( max( color, 0.0 ), 1.0 );
    }
  `,
}

/**
 * Studio foto buatan, dipakai sebagai sumber pantulan.
 *
 * Ini pengganti RoomEnvironment bawaan Three — ruangan itu isinya bentuk-bentuk
 * mirip furnitur, dan pantulannya di cat mobil kelihatan acak dan aneh.
 *
 * Studio beneran isinya cuma bidang-bidang besar: langit-langit terang, dinding
 * netral, lantai gelap, plus dua strip softbox memanjang. Bodi mobil itu cermin
 * melengkung — dua strip itulah yang jadi garis sorot panjang yang ngalir
 * ngikutin lekuk bodi. Itu ciri khas foto mobil yang bikinnya kelihatan nyata.
 */
function createStudioEnvironment() {
  const env = new THREE.Scene()
  const size = 10

  const panel = (hex, intensity, width, height, position) => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
    material.color.setHex(hex).multiplyScalar(intensity)
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material)
    mesh.position.set(...position)
    mesh.lookAt(0, 0, 0)
    env.add(mesh)
  }

  const span = size * 2

  panel(0xf2f6ff, 1.35, span, span, [0, size, 0]) // langit-langit
  panel(0x05060a, 0.25, span, span, [0, -size, 0]) // lantai
  panel(0x8fa0b8, 0.3, span, span, [-size, 0, 0])
  panel(0x8fa0b8, 0.2, span, span, [size, 0, 0])
  panel(0x9aa8bd, 0.26, span, span, [0, 0, -size])
  panel(0x9aa8bd, 0.26, span, span, [0, 0, size])

  // dua softbox strip — sumber garis sorot di bodi
  panel(0xffffff, 7.5, size * 1.7, 1.5, [0, size * 0.9, 2.4])
  panel(0xffffff, 4.2, size * 1.7, 1.1, [0, size * 0.9, -2.8])

  return env
}

/** Bayangan kontak lembut di bawah mobil. */
function createContactShadow(size) {
  const material = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0.82 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec2 p = ( vUv * 2.0 - 1.0 ) * vec2( 1.85, 1.0 );
        float a = pow( 1.0 - smoothstep( 0.0, 1.0, length( p ) ), 2.6 );
        gl_FragColor = vec4( 0.0, 0.0, 0.0, a * uOpacity );
      }
    `,
    transparent: true,
    depthWrite: false,
  })

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.005
  mesh.renderOrder = 2
  return mesh
}

export class GarageScene {
  constructor(canvas, { highQuality = true } = {}) {
    this.canvas = canvas
    this.highQuality = highQuality
    this.clock = new THREE.Clock()
    this.focusDistance = 5

    this._initRenderer()
    this._initScene()
    this._initCamera()
    this._initEnvironment()
    this._initRoom()
    this._initStage()
    this._initLights()
    this._initPost()

    this.resize()

    this._resizeObserver = new ResizeObserver(() => this.resize())
    this._resizeObserver.observe(this.canvas)
    window.addEventListener('resize', () => this.resize())

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.render(1 / 60)
    })
  }

  _detectSoftwareRenderer() {
    const gl = this.renderer.getContext()
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''
    this.gpuName = name
    return /swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(name)
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false })
    if (this._detectSoftwareRenderer()) this.highQuality = false

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.highQuality ? 1.5 : 1))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.02
    this.renderer.shadowMap.enabled = this.highQuality
    this.renderer.shadowMap.type = THREE.PCFShadowMap
  }

  _initScene() {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(BG_COLOR)
    this.scene.fog = new THREE.FogExp2(BG_COLOR, 0.055)
  }

  _initCamera() {
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 90)
    this.camera.position.set(2, 0.4, 3.8)
  }

  _initEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(createStudioEnvironment(), 0.03).texture

    // Ini yang nentuin mobil bercat gelap kelihatan apa nggak. Cat hitam nyaris
    // gak mantulin cahaya langsung — yang kita lihat sebenernya pantulan
    // lingkungan di permukaannya. Kalau environment-nya diredupin, Revuelto dan
    // Senna langsung lenyap jadi siluet hitam.
    this.scene.environmentIntensity = 1.0
    pmrem.dispose()
  }

  _initRoom() {
    const floorSize = 44

    this.floorBase = new THREE.Mesh(
      new THREE.PlaneGeometry(floorSize, floorSize),
      // Beton dipoles, bukan cermin logam. Lantainya mantulin environment map
      // secara lembut — cukup buat nempelin mobil ke ruangan, tanpa perlu
      // Reflector yang harus nge-render ulang seluruh scene.
      new THREE.MeshStandardMaterial({ color: 0x0a0b0f, roughness: 0.38, metalness: 0.52 })
    )
    this.floorBase.rotation.x = -Math.PI / 2
    this.floorBase.receiveShadow = true
    this.scene.add(this.floorBase)

    const walls = new THREE.Mesh(
      new THREE.CylinderGeometry(19, 19, 22, 40, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x0a0b11,
        roughness: 0.96,
        metalness: 0.04,
        side: THREE.BackSide,
      })
    )
    walls.position.y = 11
    this.scene.add(walls)
  }

  _initStage() {
    this.stage = new THREE.Group()
    this.scene.add(this.stage)

    this.contactShadow = createContactShadow(7.5)
    this.contactShadow.visible = !this.renderer.shadowMap.enabled
    this.stage.add(this.contactShadow)
  }

  /**
   * Pencahayaan ala studio foto mobil, bukan ala game.
   *
   * Kuncinya RectAreaLight: sumber cahaya yang punya LUAS, bukan titik. Bodi
   * mobil itu cermin melengkung — yang kita lihat di catnya sebenernya pantulan
   * bentuk lampunya. Lampu titik cuma ninggalin kilatan kecil; softbox panjang
   * ninggalin garis sorot memanjang yang ngikutin lekuk bodi. Itu yang bikin
   * mobil kelihatan difoto beneran.
   */
  _initLights() {
    RectAreaLightUniformsLib.init()

    this.scene.add(new THREE.AmbientLight(0x0d1119, 1.2))

    // Semua lampu warnanya nyaris putih. Cahaya berwarna jenuh itu yang bikin
    // kesan "dibuat-buat" — di studio foto beneran yang dipakai lampu netral,
    // paling beda sedikit suhu warnanya.
    const key = new THREE.RectAreaLight(0xfff2e4, 34, 9, 2.2)
    key.position.set(-2.6, 4.6, 3.1)
    key.lookAt(0, 0.6, 0)
    this.scene.add(key)

    const fill = new THREE.RectAreaLight(0xdce8ff, 13, 7, 2.6)
    fill.position.set(4.4, 2.9, -1.4)
    fill.lookAt(0, 0.7, 0)
    this.scene.add(fill)

    // Garis panjang tipis di atas: ninggalin sorot memanjang di atap dan bahu
    // bodi, jadi lekuknya kebaca walaupun catnya hitam.
    const top = new THREE.RectAreaLight(0xffffff, 22, 7.5, 0.55)
    top.position.set(0.4, 4.6, -0.4)
    top.lookAt(0, 0.8, 0)
    this.scene.add(top)

    // Pantulan dari lantai. Di pemotretan mobil beneran selalu ada papan
    // reflektor rendah buat ngangkat bagian bawah bodi — tanpa itu, sill dan
    // bumper bawah nyatu jadi hitam pekat.
    const bounce = new THREE.RectAreaLight(0xcfdcf0, 7, 8, 3)
    bounce.position.set(0, 0.06, 3.1)
    bounce.lookAt(0, 1.1, 0)
    this.scene.add(bounce)

    // Satu spotlight buat bayangan — RectAreaLight gak bisa bikin bayangan.
    // Intensitasnya kecil, tugasnya cuma nempelin mobil ke lantai.
    const shadowCaster = new THREE.SpotLight(0xffffff, 26, 22, 0.62, 0.9, 1.5)
    shadowCaster.position.set(-1.4, 7.5, 2.2)
    shadowCaster.castShadow = this.highQuality
    shadowCaster.shadow.mapSize.set(1024, 1024)
    shadowCaster.shadow.bias = -0.0013
    shadowCaster.shadow.normalBias = 0.022
    shadowCaster.shadow.camera.near = 1.5
    shadowCaster.shadow.camera.far = 18
    this.scene.add(shadowCaster)
    this.scene.add(shadowCaster.target)
    this.keyLight = shadowCaster

    // Warna khas tiap mobil dipakai buat nyapu DINDING di belakang, bukan buat
    // nyorot bodinya. Cahaya berwarna yang kena cat langsung itu yang bikin
    // kelihatan kayak game — di foto beneran, warna latar datang dari lampu di
    // ruangan, dan mobilnya sendiri tetap kena cahaya netral.
    this.accentLight = new THREE.SpotLight(0xff2d3d, 150, 30, 0.95, 1.0, 1.1)
    this.accentLight.position.set(0, 2.4, -7)
    this.accentLight.target.position.set(0, 2.6, -16)
    this.scene.add(this.accentLight)
    this.scene.add(this.accentLight.target)

    // Rim tipis di belakang mobil buat misahin siluet dari latar. Sengaja
    // nyaris putih — cuma kebawa sedikit warna aksen.
    this.rimLight = new THREE.SpotLight(0xffffff, 26, 10, 0.7, 0.95, 1.6)
    this.rimLight.position.set(-1.6, 1.5, -3.8)
    this.scene.add(this.rimLight)
    this.scene.add(this.rimLight.target)
  }

  _initPost() {
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))

    // Depth of field. Ini sinyal sinematik paling kuat: mata langsung baca
    // "ini lensa", bukan "ini render". Fokusnya ngikutin jarak kamera ke titik
    // bidikan, jadi yang tajam selalu bagian mobil yang lagi disorot.
    this.bokeh = new BokehPass(this.scene, this.camera, {
      focus: 5,
      aperture: 0.00058,
      maxblur: 0.011,
    })
    this.composer.addPass(this.bokeh)

    this.film = new ShaderPass(FILM_SHADER)
    this.composer.addPass(this.film)

    this.composer.addPass(new OutputPass())
  }

  /** Warna aksen per mobil — cuma nyentuh satu lampu, gak bikin ring nyala. */
  setAccent(hex, { instant = false } = {}) {
    const color = new THREE.Color(hex)
    if (instant) {
      this.accentLight.color.copy(color)
      this._accentTarget = null
      return
    }
    this._accentTarget = color
  }

  setPointer(nx, ny) {
    this.director?.setPointer(nx, ny)
  }

  setFocusDistance(distance) {
    this.focusDistance = distance
  }

  _trackPerformance(dt) {
    this._frameCount = (this._frameCount ?? 0) + 1
    if (this._frameCount < 90) return

    const samples = (this._frameTimes ??= [])
    samples.push(dt)
    if (samples.length < 60) return

    // MEDIAN, bukan rata-rata. Ini penting.
    //
    // Rata-rata gampang diracuni satu frame nyangkut. Waktu model mobil
    // berikutnya di-decode, ada hentakan ratusan milidetik SEKALI — dan itu
    // cukup buat ngangkat rata-rata 60 frame ke atas ambang batas, walaupun
    // 59 frame lainnya mulus 60fps. Akibatnya fitur dimatiin permanen di
    // perangkat yang sebenernya sanggup (kejadian di MX350: kualitas penuh
    // cuma 4,4 ms, tapi bayangannya tetap dicopot).
    //
    // Median gak bisa digeser sama satu pencilan — dia cuma turun kalau
    // perangkatnya emang beneran gak kuat secara konsisten.
    const sorted = [...samples].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    samples.length = 0

    if (median > 0.021) this._downgrade()
  }

  /**
   * Urutannya penting: depth of field dikorbankan PALING TERAKHIR.
   *
   * DOF itu inti kesan sinematiknya — begitu dimatiin, gambarnya balik kelihatan
   * kayak render 3D biasa. Bayangan asli dan resolusi render jauh lebih murah
   * buat dilepas, dan bedanya nyaris gak kelihatan.
   */
  _downgrade() {
    if (this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.enabled = false
      this.keyLight.castShadow = false
      this.contactShadow.visible = true
      this.scene.traverse((o) => {
        if (o.isMesh && o.material) o.material.needsUpdate = true
      })
      return
    }

    if (this.renderer.getPixelRatio() > 1) {
      this.renderer.setPixelRatio(1)
      this.resize()
      return
    }

    if (this.bokeh && this.bokeh.enabled !== false) this.bokeh.enabled = false
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    const width = Math.max(1, Math.round(rect.width || window.innerWidth))
    const height = Math.max(1, Math.round(rect.height || window.innerHeight))

    this._appliedWidth = width
    this._appliedHeight = height

    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
    this.composer?.setSize(width, height)

    // Di layar sempit, kamera dimundurin proporsional biar shot close-up-nya
    // gak jadi kepotong di kiri-kanan.
    if (this.director) {
      // Batas mundurnya 2,4x. Buat nyamain cakupan layar lebar sebenernya
      // butuh sekitar 4x, tapi sejauh itu mobilnya ketelan kabut. Sisa
      // kekurangannya ditutup sama pelebaran lensa di bawah, dan sedikit
      // terpotong di layar tegak itu wajar — sama kayak film diputar di HP.
      this.director.framingScale = THREE.MathUtils.clamp(1.78 / this.camera.aspect, 1, 2.05)
      const portrait = this.camera.aspect < 1
      this.director.fovBoost = portrait ? 9 : 0
      this.director.verticalShift = portrait ? 0.42 : 0

      // di layar sempit mobilnya balik ke tengah, karena teksnya pindah ke bawah
      this.director.frameOffset = width >= 900 ? 0.5 : 0
    }
  }

  render(delta) {
    const dt = delta ?? Math.min(this.clock.getDelta(), 0.1)

    // Jaring pengaman ukuran. Kalau halaman kebuka pas viewport-nya masih nol
    // (tab background, panel ketutup), resize awal kehitung 1x1 dan framing
    // kameranya nyangkut di setelan yang salah — di HP hasilnya mobil kepotong
    // parah. Cek ini murah dan bikin gak bergantung ke ResizeObserver.
    if (
      this.canvas.clientWidth !== this._appliedWidth ||
      this.canvas.clientHeight !== this._appliedHeight
    ) {
      if (this.canvas.clientWidth > 0 && this.canvas.clientHeight > 0) this.resize()
    }

    this._trackPerformance(dt)

    if (this._accentTarget) {
      this.accentLight.color.lerp(this._accentTarget, 1 - Math.pow(0.002, dt))
    }

    if (this.bokeh?.enabled !== false) {
      this.bokeh.uniforms.focus.value +=
        (this.focusDistance - this.bokeh.uniforms.focus.value) * (1 - Math.pow(0.01, dt))
    }
    this.film.uniforms.uTime.value += dt

    this.composer.render(dt)
  }
}
