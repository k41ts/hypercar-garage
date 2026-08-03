import ScrollTrigger from 'gsap/ScrollTrigger'
import { CARS } from './data.js'
import { GarageScene } from './scene.js'
import { CarManager } from './carManager.js'
import { buildUI, buildNav } from './ui.js'
import { initScroll } from './scroll.js'

const loader = document.getElementById('loader')
const loaderBar = document.getElementById('loader-bar')
const loaderPct = document.getElementById('loader-pct')

function setProgress(value) {
  const percent = Math.round(Math.min(value, 1) * 100)
  loaderBar.style.width = `${percent}%`
  loaderPct.textContent = `${percent}%`
}

// Browser suka ngembaliin posisi scroll terakhir — di sini bikin animasinya
// mulai dari tengah-tengah, jadi dipaksa balik ke atas.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
window.scrollTo(0, 0)

document.body.classList.add('is-loading')

buildUI(document.getElementById('app'), CARS)
buildNav(document.getElementById('nav'), CARS)

// Reflector + shadow resolusi tinggi terlalu berat buat perangkat kecil.
const highQuality =
  window.matchMedia('(min-width: 901px)').matches &&
  !window.matchMedia('(pointer: coarse)').matches

const garage = new GarageScene(document.getElementById('webgl'), { highQuality })
garage.setAccent(CARS[0].accent, { instant: true })

const carManager = new CarManager(garage, CARS, {
  onProgress: (index, ratio) => {
    if (index === 0) setProgress(ratio)
  },
})

initScroll({ garage, carManager, cars: CARS })

if (import.meta.env.DEV) window.__kaicar = { garage, carManager }

try {
  await carManager.load(0)
  setProgress(1)

  // Ini yang paling nentuin. Kalau shader baru dikompilasi pas render pertama,
  // Three ngerjain semuanya sekaligus di main thread — dan driver Intel lewat
  // ANGLE bisa makan ratusan milidetik per program. Dikali puluhan varian,
  // tab-nya beku berpuluh detik. compileAsync mindahin itu ke luar jalur blokir.
  await garage.renderer.compileAsync(garage.scene, garage.camera)
} catch (error) {
  console.error('Gagal nyiapin scene:', error)
  loaderPct.textContent = 'Model gagal dimuat'
}

loader.classList.add('is-done')
document.body.classList.remove('is-loading')
ScrollTrigger.refresh()

// Frame pertama digambar lewat setTimeout, bukan requestAnimationFrame: rAF
// gak pernah jalan selama tab-nya gak kelihatan, jadi canvas-nya bakal kosong.
setTimeout(() => garage.render(1 / 60), 0)

// Sisa mobilnya dicicil pas browser nganggur — selagi orang masih baca bagian
// pembuka. Kalau nunggu sampai mobilnya mau muncul, decode-nya bikin hentakan
// tepat di tengah gerakan kamera.
carManager.prefetchAll()
