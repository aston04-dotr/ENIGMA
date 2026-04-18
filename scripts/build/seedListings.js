import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('ENV NOT LOADED');
    process.exit(1);
}
const cities = JSON.parse(readFileSync(join(process.cwd(), 'web', 'src', 'lib', 'russianCities.json'), 'utf8'));
const MODE = (process.env.SEED_MODE === 'full' ? 'full' : 'test');
const TOTAL = MODE === 'full' ? cities.length * 100 : 200;
const DELAY_MS = 38;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
});
console.log('ENV CHECK:', process.env.SUPABASE_URL, !!process.env.SUPABASE_SERVICE_KEY);
console.log('CONNECTED TO SUPABASE');
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
];
const titleStarts = [
    'Продам',
    'Отдам',
    'Куплю в хорошем состоянии',
    'Идеальное предложение',
    'Срочно',
    'Новый',
    'Почти новый',
    'Дёшево',
    'Выгодно',
    'Лучшее предложение',
];
const titleItems = [
    'смартфон',
    'ноутбук',
    'холодильник',
    'стиральная машина',
    'диван',
    'шуба',
    'велосипед',
    'электросамокат',
    'посудомоечная машина',
    'телевизор',
    'зеркальный фотоаппарат',
    'гитара',
    'робот-пылесос',
    'пароварка',
    'принтер',
    'стол и стул',
    'кресло',
    'пылесос',
    'кухонный гарнитур',
    'комплект мебели',
];
const titleQualities = [
    'как новый',
    'с гарантией',
    'с документами',
    'без царапин',
    'в отличном состоянии',
    'с минимальным пробегом',
    'для дома и офиса',
    'для комфортной жизни',
    'отличный вариант',
    'срочно, торг уместен',
];
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
];
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
];
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
];
const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const choose = (items) => items[random(0, items.length - 1)];
const shuffle = (items) => [...items].sort(() => Math.random() - 0.5);
const buildTitle = (city) => {
    const start = choose(titleStarts);
    const item = choose(titleItems);
    const quality = choose(titleQualities);
    return `${start} ${item} ${quality} в ${city}`;
};
const buildDescription = (category, city) => {
    const parts = shuffle(descriptionPhrases).slice(0, 3);
    const closing = choose(descriptionClosings);
    return [`Категория: ${category}.`, ...parts, closing].join(' ');
};
const buildPrice = (category) => {
    const base = {
        'Телефоны и аксессуары': [7000, 70000],
        'Компьютеры и ноутбуки': [12000, 130000],
        'Бытовая техника': [5000, 85000],
        'Мебель и интерьер': [1500, 95000],
        'Одежда и обувь': [400, 22000],
        'Детские товары': [500, 45000],
        'Спорт и отдых': [800, 52000],
        'Красота и здоровье': [400, 28000],
        'Авто и мото': [45000, 900000],
        'Недвижимость': [500000, 12000000],
        'Работа': [10000, 250000],
        'Животные': [1000, 18000],
        'Инструменты': [700, 45000],
        'Книги и журналы': [100, 5500],
        'Коллекционирование': [300, 150000],
        'Фото и видео': [2500, 210000],
        'Музыкальные инструменты': [1200, 120000],
        'Хобби и творчество': [300, 31000],
        'Сад и дача': [500, 67000],
        'Товары для дома': [700, 32000],
    }[category] || [500, 50000];
    const [min, max] = base;
    return Math.round((random(min, max) / 100) * 100);
};
const buildImages = (seed) => {
    const count = random(3, 5);
    const keyword = choose(imageKeywords);
    return Array.from({ length: count }, (_, index) => {
        return `https://loremflickr.com/640/480/${keyword}?lock=${seed}-${index}`;
    });
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const VALIDATE_ONLY = process.env.VALIDATE_ONLY === '1' || process.env.VALIDATE_ONLY === 'true';
const validateEnvironment = () => {
    if (!process.env.SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL in environment');
    }
    if (!process.env.SUPABASE_SERVICE_KEY) {
        throw new Error('Missing SUPABASE_SERVICE_KEY in environment');
    }
};
const validateCities = () => {
    if (!Array.isArray(cities)) {
        throw new Error('russianCities.json must contain an array');
    }
    if (cities.length === 0) {
        throw new Error('russianCities.json array is empty');
    }
    if (cities.length <= 100) {
        throw new Error(`russianCities.json must contain more than 100 cities, found ${cities.length}`);
    }
};
const validateGeneration = () => {
    const sampleCity = choose(cities);
    const sampleCategory = choose(categories);
    const sampleTitle = buildTitle(sampleCity);
    const sampleDescription = buildDescription(sampleCategory, sampleCity);
    if (!sampleCity) {
        throw new Error('Generated city is undefined');
    }
    if (!sampleTitle || !sampleTitle.trim()) {
        throw new Error('Generated title is empty');
    }
    if (!sampleDescription || !sampleDescription.trim()) {
        throw new Error('Generated description is empty');
    }
};
const validateSupabase = async () => {
    const { error } = await supabase
        .from('listings')
        .select('title,description,price,city,category,images')
        .limit(1);
    if (error) {
        console.error('ERROR CONNECT', error.message);
        throw new Error(`Supabase listings validation failed: ${error.message}`);
    }
};
const validateReadiness = async () => {
    validateEnvironment();
    validateCities();
    validateGeneration();
    await validateSupabase();
    console.log('READY FOR SEED');
};
const insertListing = async (index, cityOverride) => {
    const category = choose(categories);
    const city = cityOverride ?? choose(cities);
    const title = buildTitle(city);
    const description = buildDescription(category, city);
    const price = buildPrice(category);
    const images = buildImages(`${Date.now()}-${index}`);
    const payload = { title, description, price, city, category, images };
    try {
        const { error } = await supabase.from('listings').insert(payload);
        if (error) {
            console.error(`ERROR ${index + 1}/${TOTAL}`, error.message);
        }
        else {
            console.log(`OK ${index + 1}/${TOTAL}`);
        }
    }
    catch (error) {
        console.error(`ERROR ${index + 1}/${TOTAL}`, error);
    }
    await wait(DELAY_MS);
};
const run = async () => {
    await validateReadiness();
    if (VALIDATE_ONLY) {
        return;
    }
    console.log(`SEED START: mode=${MODE}, total=${TOTAL}`);
    if (MODE === 'full') {
        let index = 0;
        for (const city of cities) {
            for (let cityItem = 0; cityItem < 100; cityItem += 1) {
                await insertListing(index, city);
                index += 1;
            }
        }
    }
    else {
        for (let i = 0; i < TOTAL; i += 1) {
            await insertListing(i);
        }
    }
    console.log('SEED COMPLETED');
};
run().catch((error) => {
    console.error(error.message || 'Unexpected seed error');
    process.exit(1);
});
