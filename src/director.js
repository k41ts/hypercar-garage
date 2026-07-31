import * as THREE from 'three'

/**
 * Sutradara kamera.
 *
 * Ini inti dari kesan sinematiknya: yang gerak KAMERA, bukan mobilnya. Mobil
 * muter di tempat itu bahasa video game (layar pilih karakter). Film ngegerakin
 * kamera — dolly, crane, ngelewatin bodi — sementara objeknya diam.
 *
 * Tiap mobil punya urutan shot. Scroll ngegeser posisi di antara shot-shot itu,
 * jadi rasanya kayak satu gerakan kamera panjang yang gak putus.
 */

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/**
 * Shot dirancang buat mobil yang udah dinormalisasi: panjang ~4,7 unit, tinggi
 * ~1,2, moncong ngadep +Z, nempel lantai di origin.
 *
 * Tinggi kamera sengaja rendah (0,4–1,1) — setinggi pinggang mobil. Itu sudut
 * yang bikin mobil kelihatan besar dan berwibawa; sudut mata orang berdiri
 * bikin mobil kelihatan kayak mainan.
 */
export const SHOTS = [
  // 1. Buka dari dekat di depan, rendah banget — moncong dulu, badan belakangan
  {
    position: [2.05, 0.38, 3.75],
    target: [0.1, 0.58, 1.15],
    fov: 30,
  },
  // 2. Kamera nyusur ke samping, ngelewatin roda depan
  {
    position: [3.55, 0.62, 2.05],
    target: [0.25, 0.62, 0.35],
    fov: 33,
  },
  // 3. Profil samping, agak naik — pertama kali bentuk utuhnya kebaca
  {
    position: [5.15, 1.05, -0.15],
    target: [0, 0.78, 0],
    fov: 39,
  },
  // 4. Turun lagi ke belakang, mepet — sayap dan knalpot
  {
    position: [-2.85, 0.72, -3.45],
    target: [-0.15, 0.82, -0.95],
    fov: 31,
  },
  // 5. Mundur jauh jadi wide, mobil utuh di ruang gelap
  {
    position: [1.15, 1.95, 6.45],
    target: [0, 0.72, 0],
    fov: 42,
  },
]

export class CameraDirector {
  constructor(camera) {
    this.camera = camera
    this.shots = SHOTS

    this.position = new THREE.Vector3().fromArray(SHOTS[0].position)
    this.target = new THREE.Vector3().fromArray(SHOTS[0].target)
    this.fov = SHOTS[0].fov

    this._desiredPosition = this.position.clone()
    this._desiredTarget = this.target.clone()
    this._desiredFov = this.fov

    this.pointer = new THREE.Vector2()
    this._pointerTarget = new THREE.Vector2()
    this._time = 0

    // seberapa jauh kamera dimundurin di layar sempit (diisi sama resize)
    this.framingScale = 1

    // Tambahan sudut pandang buat layar tegak. Layar HP itu sempit banget
    // horizontalnya, dan mundurin kamera doang gak cukup — buat nyamain
    // cakupan layar lebar butuh mundur 4x lipat, dan sejauh itu mobilnya
    // ketelan kabut plus kelihatan gepeng kayak dizoom teleskop. Jadi
    // sebagiannya diselesaikan dengan melebarkan lensa.
    this.fovBoost = 0

    // Ngangkat mobil ke atas dalam frame. Di layar tegak, teksnya numpuk di
    // sepertiga bawah — kalau mobilnya nangkring di tengah, bodinya ketiban
    // tulisan. Titik bidik diturunin bikin kamera nunduk, jadi mobilnya naik
    // dan ruang hitam kosong di atas kepakai.
    this.verticalShift = 0

    // Titik bidik digeser ke kiri, jadi mobilnya nongkrong agak ke kanan layar
    // dan sisi kiri tetep gelap buat naro teks. Ini trik framing standar di
    // film: subjek gak ditaro persis di tengah.
    this.frameOffset = 0
  }

  setPointer(x, y) {
    this._pointerTarget.set(x, y)
  }

  /** progress 0..1 sepanjang satu bab; nentuin posisi kita di antara shot. */
  setProgress(progress) {
    const clamped = THREE.MathUtils.clamp(progress, 0, 1)
    const span = this.shots.length - 1
    const scaled = clamped * span

    const index = Math.min(Math.floor(scaled), span - 1)
    const t = easeInOutCubic(scaled - index)

    const from = this.shots[index]
    const to = this.shots[index + 1]

    this._desiredPosition.fromArray(from.position).lerp(_tmp.fromArray(to.position), t)
    this._desiredTarget.fromArray(from.target).lerp(_tmp.fromArray(to.target), t)
    this._desiredFov = THREE.MathUtils.lerp(from.fov, to.fov, t)
  }

  update(dt) {
    this._time += dt

    // Kamera dikasih goyangan halus banget, kayak dipegang tangan. Kamera yang
    // diam sempurna secara matematis itu justru kerasa "komputer" — gerakan
    // mikro sedikit bikin gambarnya terasa direkam beneran.
    const driftX = Math.sin(this._time * 0.31) * 0.014 + Math.sin(this._time * 0.13) * 0.009
    const driftY = Math.cos(this._time * 0.24) * 0.011 + Math.sin(this._time * 0.17) * 0.006

    this.pointer.lerp(this._pointerTarget, 1 - Math.pow(0.0025, dt))

    // dikejar pelan, jadi scroll cepat gak bikin kameranya nyentak
    const chase = 1 - Math.pow(0.0009, dt)
    this.position.lerp(this._desiredPosition, chase)
    this.target.lerp(this._desiredTarget, chase)

    const distance = this.position.distanceTo(this.target)

    let camX = this.position.x * this.framingScale + driftX + this.pointer.x * 0.11
    const camY = this.position.y * this.framingScale + driftY + this.pointer.y * -0.06
    let camZ = this.position.z * this.framingScale

    // Jaring pengaman: kamera gak boleh lebih dekat dari radius ini ke poros
    // mobil. Setengah diagonal mobil sekitar 2,6 unit — kalau kelewat dekat,
    // kameranya nembus masuk ke dalam bodi dan gambarnya jadi kacau. Shot-shot
    // di atas semuanya di radius 4+, jadi ini normalnya gak pernah kepakai;
    // gunanya buat jaga-jaga kalau angkanya diutak-atik nanti.
    const MIN_RADIUS = 3.0
    const flat = Math.hypot(camX, camZ)
    if (flat < MIN_RADIUS && flat > 0.001) {
      const push = MIN_RADIUS / flat
      camX *= push
      camZ *= push
    }

    this.camera.position.set(camX, camY, camZ)
    this.camera.lookAt(
      this.target.x - this.frameOffset,
      this.target.y - this.verticalShift,
      this.target.z
    )

    const fov = THREE.MathUtils.lerp(this.camera.fov, this._desiredFov + this.fovBoost, chase)
    if (Math.abs(fov - this.camera.fov) > 0.001) {
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }

    return distance
  }
}

const _tmp = new THREE.Vector3()
