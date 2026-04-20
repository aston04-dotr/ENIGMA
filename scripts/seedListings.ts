import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('ENV NOT LOADED')
  process.exit(1)
}

const cities: string[] = JSON.parse(
  readFileSync(join(process.cwd(), 'web', 'src', 'lib', 'russianCities.json'), 'utf8'),
)

const MODE = (process.env.SEED_MODE === 'full' ? 'full' : 'test') as 'test' | 'full'
const TOTAL = MODE === 'full' ? cities.length * 100 : 200
const DELAY_MS = 38

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    auth: { persistSession: false },
  },
)

console.log('ENV CHECK:', process.env.SUPABASE_URL, !!process.env.SUPABASE_SERVICE_KEY)
console.log('CONNECTED TO SUPABASE')

const categories = [
  'Телефоны и аксессуары',
  'Компьютеры и ноутбуки',
  'Бытовая техника',
  'Мебель и интерьер',
  'Одежда и обувь',
  'Детские товары',
  'Спорт и отдых',
  'Красота и здоровье',
  'Авто и мото',
  'Недвижимость',
  'Работа',
  'Животные',
  'Инструменты',
  'Книги и журналы',
  'Коллекционирование',
  'Фото и видео',
  'Музыкальные инструменты',
  'Хобби и творчество',
  'Сад и дача',
  'Товары для дома',
]

const titleStarts = [
  'iPhone',
  'Samsung Galaxy',
  'MacBook',
  'Lenovo',
  'Sony',
  'LG',
  'Bosch',
  'Xiaomi',
  'Huawei',
  'Nokia',
]

const titleItems = [
  '13 Pro',
  'S23 Ultra',
  'Air M1',
  'ThinkPad',
  'Xperia',
  'OLED TV',
  'стиральная машина',
  'холодильник',
  'ноутбук',
  'планшет',
  'наушники',
  'колонка',
  'фотоаппарат',
  'принтер',
  'роутер',
  'монитор',
  'клавиатура',
  'мышь',
  'диван',
  'кровать',
]

const titleQualities = [
  'новый',
  'почти новый',
  'б/у',
  'в отличном состоянии',
  'с гарантией',
  'оригинал',
]

const descriptionPhrases = [
  'Пользовались аккуратно, есть все документы.',
  'Идеальный вариант для тех, кто ищет качественный товар.',
  'Гарантия производителя ещё действует.',
  'Подходит для дачи, дома, офиса или подарка.',
  'Продаю в связи с переездом.',
  'В комплекте все аксессуары и оригинальная упаковка.',
  'Технически исправен, работает без нареканий.',
  'Только один собственник, брал в магазине.',
  'Возможен торг при самовывозе.',
  'Отличное состояние, без потертостей и дефектов.',
]

const descriptionClosings = [
  'Самовывоз из города.',
  'Отправлю транспортной компанией.',
  'Звоните или пишите в любой день.',
  'Рассмотрю обмен на аналогичный товар.',
  'Цена окончательная, но торг возможен.',
  'Фото по запросу, отвечу быстро.',
  'Доставка по договорённости.',
  'Возможен быстрый показ в удобное время.',
  'Все вопросы по телефону.',
  'Подробности в личных сообщениях.',
]

const imageKeywords = [
  'phone',
  'laptop',
  'kitchen',
  'furniture',
  'clothes',
  'sport',
  'beauty',
  'auto',
  'garden',
  'pet',
]

const random = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
const choose = <T>(items: T[]) => items[random(0, items.length - 1)]
const shuffle = <T>(items: T[]) => [...items].sort(() => Math.random() - 0.5)

const buildTitle = (): string => {
  const start = choose(titleStarts)
  const item = choose(titleItems)
  const quality = random(0, 2) === 0 ? '' : ` ${choose(titleQualities)}`
  return `${start} ${item}${quality}`.trim()
}

const buildDescription = (category: string, city: string): string => {
  const parts = shuffle(descriptionPhrases).slice(0, 3)
  const closing = choose(descriptionClosings)
  return [`Категория: ${category}.`, ...parts, closing].join(' ')
}

const buildPrice = (category: string): number => {
  const base = {
    'Телефоны и аксессуары': [15000, 150000],
    'Компьютеры и ноутбуки': [20000, 200000],
    'Бытовая техника': [10000, 100000],
    'Мебель и интерьер': [5000, 50000],
    'Одежда и обувь': [1000, 20000],
    'Детские товары': [2000, 30000],
    'Спорт и отдых': [3000, 50000],
    'Красота и здоровье': [500, 15000],
    'Авто и мото': [50000, 1000000],
    'Недвижимость': [1000000, 50000000],
    'Работа': [20000, 300000],
    'Животные': [1000, 20000],
    'Инструменты': [1000, 30000],
    'Книги и журналы': [100, 5000],
    'Коллекционирование': [500, 100000],
    'Фото и видео': [5000, 150000],
    'Музыкальные инструменты': [2000, 100000],
    'Хобби и творчество': [500, 20000],
    'Сад и дача': [1000, 50000],
    'Товары для дома': [1000, 25000],
  }[category] || [1000, 50000]

  const [min, max] = base
  const price = random(min, max)
  // Округлять до сотен или тысяч
  if (price < 10000) {
    return Math.round(price / 100) * 100
  } else {
    return Math.round(price / 1000) * 1000
  }
}

const buildImages = (seed: string): string[] => {
  const count = random(1, 3) // минимум 1, максимум 3
  return Array.from({ length: count }, (_, index) => {
    return `https://picsum.photos/400/400?random=${seed}-${index}`
  })
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const VALIDATE_ONLY = process.env.VALIDATE_ONLY === '1' || process.env.VALIDATE_ONLY === 'true'

const validateEnvironment = () => {
  if (!process.env.SUPABASE_URL) {
    throw new Error('Missing SUPABASE_URL in environment')
  }

  if (!process.env.SUPABASE_SERVICE_KEY) {
    throw new Error('Missing SUPABASE_SERVICE_KEY in environment')
  }
}

const validateCities = () => {
  if (!Array.isArray(cities)) {
    throw new Error('russianCities.json must contain an array')
  }

  if (cities.length === 0) {
    throw new Error('russianCities.json array is empty')
  }

  if (cities.length <= 100) {
    throw new Error(`russianCities.json must contain more than 100 cities, found ${cities.length}`)
  }
}

const validateGeneration = () => {
  const sampleCity = choose(cities)
  const sampleCategory = choose(categories)
  const sampleTitle = buildTitle()
  const sampleDescription = buildDescription(sampleCategory, sampleCity)

  if (!sampleCity) {
    throw new Error('Generated city is undefined')
  }

  if (!sampleTitle || !sampleTitle.trim()) {
    throw new Error('Generated title is empty')
  }

  if (!sampleDescription || !sampleDescription.trim()) {
    throw new Error('Generated description is empty')
  }
}

const validateSupabase = async () => {
  const { error } = await supabase
    .from('listings')
    .select('title,description,price,city,category,images')
    .limit(1)

  if (error) {
    console.error('ERROR CONNECT', error.message)
    throw new Error(`Supabase listings validation failed: ${error.message}`)
  }
}

const validateReadiness = async () => {
  validateEnvironment()
  validateCities()
  validateGeneration()
  await validateSupabase()
  console.log('READY FOR SEED')
}

const insertListing = async (index: number, cityOverride?: string) => {
  const category = choose(categories)
  const city = cityOverride ?? choose(cities)
  const title = buildTitle()
  const description = buildDescription(category, city)
  const price = buildPrice(category)
  const images = buildImages(`${Date.now()}-${index}`)

  const payload = { title, description, price, city, category, images }

  try {
    const { error } = await supabase.from('listings').insert(payload)
    if (error) {
      console.error(`ERROR ${index + 1}/${TOTAL}`, error.message)
    } else {
      console.log(`OK ${index + 1}/${TOTAL}`)
    }
  } catch (error) {
    console.error(`ERROR ${index + 1}/${TOTAL}`, error)
  }

  await wait(DELAY_MS)
}

const run = async () => {
  await validateReadiness()

  if (VALIDATE_ONLY) {
    return
  }

  console.log(`SEED START: mode=${MODE}, total=${TOTAL}`)

  if (MODE === 'full') {
    let index = 0
    for (const city of cities) {
      for (let cityItem = 0; cityItem < 100; cityItem += 1) {
        await insertListing(index, city)
        index += 1
      }
    }
  } else {
    for (let i = 0; i < TOTAL; i += 1) {
      await insertListing(i)
    }
  }

  console.log('SEED COMPLETED')
}

run().catch((error) => {
  console.error(error.message || 'Unexpected seed error')
  process.exit(1)
})
