/**
 * Data mobil untuk showcase.
 *
 * `model.rotationOffset` dipakai buat ngelurusin arah hadap mobil, karena tiap
 * model Sketchfab bisa beda orientasi aslinya. Nilainya radian, diputer di sumbu Y.
 * `model.targetLength` = panjang mobil dalam satuan world setelah dinormalisasi.
 */
export const CARS = [
  {
    id: 'ferrari',
    brand: 'Ferrari',
    name: 'SF90 XX Stradale',
    year: '2023',
    tagline:
      'Versi jalanan dari mobil balap yang gak pernah ikut balapan. Hybrid V8 paling ganas yang pernah keluar dari Maranello.',
    accent: '#ff2d3d',
    accentDim: '#7a0f18',
    model: {
      url: '/models/ferrari-sf90xx.glb',
      rotationOffset: 0,
      targetLength: 4.6,
    },
    specs: [
      { value: '1.030', unit: 'hp', label: 'Tenaga gabungan' },
      { value: '2,3', unit: 'dtk', label: '0–100 km/j' },
      { value: '320', unit: 'km/j', label: 'Top speed' },
      { value: '1.560', unit: 'kg', label: 'Berat' },
    ],
    drivetrain: '4.0L Twin-Turbo V8 + 3 Motor Listrik · AWD · 8-speed DCT',
    facts: [
      'Ferrari jalanan paling bertenaga yang pernah dibikin pas dirilis — 1.030 hp dari V8 plus tiga motor listrik.',
      'Punya active rear wing pertama di Ferrari jalanan sejak F50 tahun 1995.',
      'Cuma dibikin 799 unit buat versi Stradale, dan semuanya ludes sebelum diumumkan ke publik.',
    ],
  },
  {
    id: 'revuelto',
    brand: 'Lamborghini',
    name: 'Revuelto',
    year: '2023',
    tagline:
      'V12 terakhir Lamborghini yang masih ngaum, sekarang ditemenin tiga motor listrik. Penerus resmi Aventador.',
    accent: '#b4ff39',
    accentDim: '#3d5c0d',
    model: {
      url: '/models/lamborghini-revuelto.glb',
      rotationOffset: 0,
      targetLength: 4.9,
    },
    specs: [
      { value: '1.015', unit: 'hp', label: 'Tenaga gabungan' },
      { value: '2,5', unit: 'dtk', label: '0–100 km/j' },
      { value: '350', unit: 'km/j', label: 'Top speed' },
      { value: '1.772', unit: 'kg', label: 'Berat kering' },
    ],
    drivetrain: '6.5L V12 Naturally Aspirated + 3 Motor Listrik · AWD · 8-speed DCT',
    facts: [
      'V12 hybrid pertama Lamborghini. Namanya diambil dari banteng petarung legendaris tahun 1880-an.',
      'Mesin V12 barunya justru lebih ringan (218 kg) dan lebih bertenaga dari punya Aventador.',
      'Sasisnya full carbon fiber "monofuselage" — 25% lebih kaku dari Aventador tapi lebih ringan.',
    ],
  },
  {
    id: 'senna',
    brand: 'McLaren',
    name: 'Senna',
    year: '2018',
    tagline:
      'Dinamai dari Ayrton Senna. Didesain bukan buat cantik, tapi buat nempel di aspal sekencang mungkin.',
    accent: '#ff7a1a',
    accentDim: '#7a3505',
    model: {
      url: '/models/mclaren-senna.glb',
      rotationOffset: 0,
      targetLength: 4.7,
      // model ini kepaket sama alas pajangan bundar + bidang lantai
      exclude: ['Cylinder_5', 'Cylinder001_6', 'Plane_7'],
    },
    specs: [
      { value: '789', unit: 'hp', label: 'Tenaga' },
      { value: '2,8', unit: 'dtk', label: '0–100 km/j' },
      { value: '340', unit: 'km/j', label: 'Top speed' },
      { value: '1.198', unit: 'kg', label: 'Berat kering' },
    ],
    drivetrain: '4.0L Twin-Turbo V8 M840TR · RWD · 7-speed DCT',
    facts: [
      'Namanya dipakai atas restu langsung keluarga Ayrton Senna — satu-satunya McLaren yang gitu.',
      'Bisa ngehasilin downforce sampai 800 kg. Tiap lekuk bodinya ada alasan aerodinamisnya.',
      'Pintunya bisa dipesan pakai panel kaca, jadi lo bisa lihat aspal ngebut di bawah kaki.',
    ],
  },
]
