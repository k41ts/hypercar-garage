/** Bikin markup section dari data mobil, biar gak nulis HTML berulang-ulang. */

const pad = (n) => String(n + 1).padStart(2, '0')

function specMarkup(spec) {
  return `
    <li class="spec" data-reveal>
      <span class="spec__value">${spec.value}<small>${spec.unit}</small></span>
      <span class="spec__label">${spec.label}</span>
    </li>`
}

function chapterMarkup(car, index) {
  return `
    <section class="chapter" data-index="${index}" style="--accent:${car.accent};--accent-dim:${car.accentDim}">
      <div class="chapter__sticky">
        <article class="panel">
          <span class="eyebrow" data-reveal>
            <i class="eyebrow__dot"></i>${pad(index)} — ${car.brand} · ${car.year}
          </span>
          <h2 class="panel__title" data-reveal>${car.name}</h2>
          <p class="panel__tagline" data-reveal>${car.tagline}</p>
          <p class="panel__drivetrain" data-reveal>${car.drivetrain}</p>
          <ul class="specs">${car.specs.map(specMarkup).join('')}</ul>
          <div class="facts" data-reveal>
            <span class="facts__label">Fun fact</span>
            <ul class="facts__list">
              ${car.facts.map((fact) => `<li>${fact}</li>`).join('')}
            </ul>
          </div>
        </article>
      </div>
    </section>`
}

export function buildUI(root, cars) {
  root.innerHTML = `
    <section class="hero">
      <div class="hero__inner">
        <span class="eyebrow"><i class="eyebrow__dot"></i>Koleksi 2018 — 2023</span>
        <h1 class="hero__title">Hyper<em>car</em><br />Garage</h1>
        <p class="hero__sub">
          Tiga mobil yang ngedefinisiin batas atas mesin pembakaran. Scroll buat
          muterin mobilnya dan baca ceritanya.
        </p>
        <div class="hero__hint">
          <span class="hero__hint-line"></span>Scroll ke bawah
        </div>
      </div>
    </section>

    ${cars.map(chapterMarkup).join('')}

    <section class="outro">
      <div class="outro__inner">
        <h2 class="outro__title">Akhir dari<br /><em>satu era</em></h2>
        <p>
          Ketiganya masih pakai mesin pembakaran yang dibantu listrik — bukan
          sepenuhnya listrik. Kemungkinan besar, generasi kayak gini gak bakal
          ada lagi.
        </p>
        <button class="outro__btn" type="button" data-scroll-top>Balik ke atas</button>
      </div>
    </section>`
}

export function buildNav(root, cars) {
  root.innerHTML = cars
    .map(
      (car, i) => `
        <button class="nav-dot" type="button" data-goto="${i}" style="--accent:${car.accent}">
          <span class="nav-dot__mark"></span>
          <span class="nav-dot__label">${car.brand}</span>
        </button>`
    )
    .join('')
}
