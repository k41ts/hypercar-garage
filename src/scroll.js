import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { CameraDirector } from './director.js'

gsap.registerPlugin(ScrollTrigger)

export function initScroll({ garage, carManager, cars }) {
  const lenis = new Lenis({ lerp: 0.075, wheelMultiplier: 0.9 })
  lenis.on('scroll', ScrollTrigger.update)

  const director = new CameraDirector(garage.camera)
  garage.director = director
  garage.resize()

  gsap.ticker.add((time, deltaTime) => {
    lenis.raf(time * 1000)
    const dt = Math.min(deltaTime / 1000, 0.1)

    carManager.update(dt)
    // jarak kamera ke titik bidikan jadi titik fokus lensa, jadi yang tajam
    // selalu bagian mobil yang lagi disorot
    garage.setFocusDistance(director.update(dt))
    garage.render(dt)
  })
  gsap.ticker.lagSmoothing(0)

  const chapters = [...document.querySelectorAll('.chapter')]
  const dots = [...document.querySelectorAll('.nav-dot')]
  const meta = document.getElementById('topbar-meta')

  const setActive = (index) => {
    carManager.show(index)
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === index))
    if (meta) meta.textContent = cars[index].brand
    document.documentElement.style.setProperty('--accent', cars[index].accent)
  }

  chapters.forEach((chapter, index) => {
    ScrollTrigger.create({
      trigger: chapter,
      start: 'top 50%',
      end: 'bottom 50%',
      onToggle: (self) => {
        if (self.isActive) setActive(index)
      },
    })

    // Scroll ngegerakin KAMERA lewat urutan shot, bukan muterin mobil.
    ScrollTrigger.create({
      trigger: chapter,
      start: 'top bottom',
      end: 'bottom top',
      scrub: true,
      onUpdate: (self) => {
        if (carManager.activeIndex === index) director.setProgress(self.progress)
      },
    })

    // Teks masuk kayak title card: naik pelan sambil memudar masuk.
    gsap.from(chapter.querySelectorAll('[data-reveal]'), {
      y: 26,
      opacity: 0,
      duration: 1.1,
      stagger: 0.09,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: chapter,
        start: 'top 58%',
        toggleActions: 'play none none reverse',
      },
    })

    // Yang di-fade harus SELURUH lapisan sticky, bukan cuma panel teksnya.
    // Scrim gelapnya nempel di situ — kalau cuma teks yang dipudarin, scrim-nya
    // ketinggalan penuh di layar dan kelihatan kayak panel gelap nutupin
    // gambar. Pas transisi antar bab, dua scrim juga sempat numpuk.
    const sticky = chapter.querySelector('.chapter__sticky')

    gsap.fromTo(
      sticky,
      { opacity: 0 },
      {
        opacity: 1,
        ease: 'none',
        scrollTrigger: { trigger: chapter, start: 'top 92%', end: 'top 40%', scrub: true },
      }
    )

    gsap.to(sticky, {
      opacity: 0,
      ease: 'none',
      scrollTrigger: { trigger: chapter, start: 'bottom 92%', end: 'bottom 42%', scrub: true },
    })
  })

  gsap.to('.hero__inner', {
    opacity: 0,
    ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  })

  dots.forEach((dot) => {
    dot.addEventListener('click', () => {
      lenis.scrollTo(chapters[Number(dot.dataset.goto)], { offset: 1, duration: 1.6 })
    })
  })

  document.querySelector('[data-scroll-top]')?.addEventListener('click', () => {
    lenis.scrollTo(0, { duration: 1.8 })
  })

  // Parallax cuma buat perangkat yang punya mouse beneran. Di layar sentuh
  // pointermove baru kepicu setelah jari nyentuh — jadi kameranya nyentak pas
  // orang mulai nge-scroll, bukan bergerak halus.
  if (window.matchMedia('(pointer: fine)').matches) {
    window.addEventListener('pointermove', (event) => {
      garage.setPointer(
        (event.clientX / window.innerWidth) * 2 - 1,
        (event.clientY / window.innerHeight) * 2 - 1
      )
    })
  }

  setActive(0)

  return lenis
}
