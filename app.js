const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid'); // npm install uuid 필요
const multer = require('multer');
const sharp = require('sharp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

const app = express();
const PORT = 3000;

// S3 클라이언트 설정
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const S3_BUCKET = process.env.AWS_S3_BUCKET;
const S3_BASE_URL = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com`;

// Multer 설정 (메모리 저장)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB 제한
});

// EJS 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 정적 파일(css, js) 폴더 설정
app.use(express.static(path.join(__dirname, 'public')));

// dogs.json 데이터 읽기 함수
function getDogs() {
    const data = fs.readFileSync(path.join(__dirname, 'dogs.json'), 'utf-8');
    return JSON.parse(data);
}

// 산책정보를 저장할 Map (key: dog id, value: walk time)
const walkMap = new Map();

// 라우터 - 메인 페이지
app.get('/', (req, res) => {
    const dogs = getDogs();
    res.render('index', { dogs });
});

// dogs API (산책시간 포함)
app.get('/dogs', (req, res) => {
    const dogs = getDogs();
    const dogsWithWalk = dogs.map(dog => ({
        ...dog,
        walkTime: walkMap.get(dog.id) || null
    }));
    res.json(dogsWithWalk);
});

// 산책정보 조회 API
app.get('/walks', (req, res) => {
    // Map을 객체로 변환해서 반환
    const walks = Object.fromEntries(walkMap);
    res.json(walks);
});

// 산책정보 저장 API (POST)
app.use(express.json());
app.post('/walks', (req, res) => {
    const { id, time } = req.body;
    if (typeof id !== 'number' || typeof time !== 'string') {
        return res.status(400).json({ error: 'id와 time이 필요합니다.' });
    }
    walkMap.set(id, time);
    res.json({ success: true });
});
app.delete('/cage/:id/walk/:walkId', (req, res) => {
    const cageId = req.params.id;
    const walkId = req.params.walkId;
    const filePath = path.join(walksDir, `cage_${cageId}_walks.json`);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: '기록이 없습니다.' });
    }

    let walks = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const newWalks = walks.filter(w => w.id !== walkId);

    if (newWalks.length === walks.length) {
        return res.status(404).json({ error: '해당 산책 기록이 없습니다.' });
    }

    fs.writeFileSync(filePath, JSON.stringify(newWalks, null, 2));
    res.json({ success: true });
});

// 산책 취소 API (DELETE)
app.delete('/walks/:id', (req, res) => {
    const id = Number(req.params.id);
    if (walkMap.has(id)) {
        walkMap.delete(id);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: '해당 id의 산책정보가 없습니다.' });
    }
});

// 전체 관리자 페이지
app.get('/adminjigdda', (req, res) => {
    res.render('admin');
});

// 견사 관리자 페이지
app.get('/cage/:id/admin', (req, res) => {
    const cageId = req.params.id;
    res.render('cageAdmin', { cageId });
});

// 견사 관리자 V2 페이지
app.get('/cage/:id/adminv2', (req, res) => {
    const cageId = parseInt(req.params.id, 10);

    // 견사 번호 유효성 검사 (1-60만 허용)
    if (isNaN(cageId) || cageId < 1 || cageId > 60) {
        return res.status(404).send(`
            <!DOCTYPE html>
            <html lang="ko">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>잘못된 접근</title>
                <style>
                    body {
                        margin: 0;
                        padding: 0;
                        font-family: 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
                        background: #f6f8fa;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                    }
                    .error-container {
                        text-align: center;
                        padding: 40px;
                        background: #fff;
                        border-radius: 16px;
                        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
                        max-width: 400px;
                    }
                    h1 {
                        font-size: 48px;
                        color: #e53935;
                        margin: 0 0 16px 0;
                    }
                    p {
                        font-size: 18px;
                        color: #666;
                        margin: 0 0 24px 0;
                    }
                    a {
                        display: inline-block;
                        padding: 12px 24px;
                        background: #667eea;
                        color: #fff;
                        text-decoration: none;
                        border-radius: 8px;
                        font-weight: 600;
                        transition: all 0.2s;
                    }
                    a:hover {
                        background: #5568d3;
                    }
                </style>
            </head>
            <body>
                <div class="error-container">
                    <h1>404</h1>
                    <p>잘못된 페이지 접근입니다</p>
                    <p style="font-size: 14px; color: #999;">견사 번호는 1-60 사이만 유효합니다</p>
                    <a href="/adminjigdda">관리자 목록으로 돌아가기</a>
                </div>
            </body>
            </html>
        `);
    }

    res.render('adminv2', { cageId });
});

// 견사 상세 페이지
app.get('/cage/:id', (req, res) => {
    const cageId = parseInt(req.params.id, 10);

    // 견사 번호 유효성 검사 (1-60만 허용)
    if (isNaN(cageId) || cageId < 1 || cageId > 60) {
        return res.status(404).send(`
            <!DOCTYPE html>
            <html lang="ko">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>잘못된 접근</title>
                <style>
                    body {
                        margin: 0;
                        padding: 0;
                        font-family: 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
                        background: #f6f8fa;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                    }
                    .error-container {
                        text-align: center;
                        padding: 40px;
                        background: #fff;
                        border-radius: 16px;
                        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
                        max-width: 400px;
                    }
                    h1 {
                        font-size: 48px;
                        color: #e53935;
                        margin: 0 0 16px 0;
                    }
                    p {
                        font-size: 18px;
                        color: #666;
                        margin: 0 0 24px 0;
                    }
                    a {
                        display: inline-block;
                        padding: 12px 24px;
                        background: #667eea;
                        color: #fff;
                        text-decoration: none;
                        border-radius: 8px;
                        font-weight: 600;
                        transition: all 0.2s;
                    }
                    a:hover {
                        background: #5568d3;
                    }
                </style>
            </head>
            <body>
                <div class="error-container">
                    <h1>404</h1>
                    <p>잘못된 페이지 접근입니다</p>
                    <p style="font-size: 14px; color: #999;">견사 번호는 1-60 사이만 유효합니다</p>
                    <a href="/cages">견사 목록으로 돌아가기</a>
                </div>
            </body>
            </html>
        `);
    }

    res.render('cage', { cageId });
});

// 견사 V2 상세 페이지 (강아지별 관리)
app.get('/cagev2/:id', (req, res) => {
    const cageId = req.params.id;
    res.render('cagev2', { cageId });
});

// 견사 리스트 페이지
app.get('/cages', (req, res) => {
    res.render('cages');
});

// 디렉토리 설정
const walksDir = path.join(__dirname, 'cage_walks');
if (!fs.existsSync(walksDir)) {
    fs.mkdirSync(walksDir);
}

const dogsDir = path.join(__dirname, 'cage_dogs');
if (!fs.existsSync(dogsDir)) {
    fs.mkdirSync(dogsDir);
}

const dogWalksDir = path.join(__dirname, 'cage_dog_walks');
if (!fs.existsSync(dogWalksDir)) {
    fs.mkdirSync(dogWalksDir);
}

const cageNamesDir = path.join(__dirname, 'cage_names');
if (!fs.existsSync(cageNamesDir)) {
    fs.mkdirSync(cageNamesDir);
}

// 견사 리스트 API (페이지네이션)
app.get('/api/cages', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const maxCages = 60; // 최대 견사 개수

    const startId = (page - 1) * limit + 1;
    const endId = Math.min(startId + limit - 1, maxCages);

    const cages = [];
    for (let i = startId; i <= endId; i++) {
        // 각 견사의 첫 번째 강아지 정보 가져오기
        const dogsFilePath = path.join(dogsDir, `cage_${i}_dogs.json`);
        let firstDogId = null;
        let imageUrl = `${S3_BASE_URL}/${i}_thumb.jpeg`;

        if (fs.existsSync(dogsFilePath)) {
            try {
                const dogs = JSON.parse(fs.readFileSync(dogsFilePath, 'utf-8'));
                if (dogs.length > 0) {
                    firstDogId = dogs[0].id;
                    imageUrl = `${S3_BASE_URL}/cage_${i}_dog_${firstDogId}_thumb.jpeg`;
                }
            } catch (err) {
                console.error(`Error reading dogs for cage ${i}:`, err);
            }
        }

        // 각 견사의 마지막 산책 정보 가져오기
        const filePath = path.join(walksDir, `cage_${i}_walks.json`);
        let lastWalkDays = null;
        let walkedToday = false;

        if (fs.existsSync(filePath)) {
            try {
                const walks = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                if (walks.length > 0) {
                    // 오늘 날짜
                    const now = new Date();
                    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

                    // 오늘 산책 확인
                    const todayWalks = walks.filter(w => {
                        const d = new Date(w.time.replace(' ', 'T'));
                        return d.getFullYear() === now.getFullYear() &&
                            d.getMonth() === now.getMonth() &&
                            d.getDate() === now.getDate();
                    });

                    if (todayWalks.length > 0) {
                        walkedToday = true;
                    } else {
                        // 오늘이 아닌 가장 최근 산책 찾기
                        const pastWalks = walks
                            .map(w => new Date(w.time.replace(' ', 'T')))
                            .filter(d => {
                                const walkDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                                return walkDate < todayDate;
                            })
                            .sort((a, b) => b - a);

                        if (pastWalks.length > 0) {
                            const lastWalk = pastWalks[0];
                            const lastWalkDate = new Date(lastWalk.getFullYear(), lastWalk.getMonth(), lastWalk.getDate());
                            lastWalkDays = Math.floor((todayDate - lastWalkDate) / (1000*60*60*24));
                        }
                    }
                }
            } catch (err) {
                console.error(`Error reading walks for cage ${i}:`, err);
            }
        }

        // 각 견사의 커스텀 이름 가져오기
        let cageName = `${i}번 견사`;
        const nameFilePath = path.join(cageNamesDir, `cage_${i}_name.json`);
        if (fs.existsSync(nameFilePath)) {
            try {
                const nameData = JSON.parse(fs.readFileSync(nameFilePath, 'utf-8'));
                if (nameData.name) {
                    cageName = nameData.name;
                }
            } catch (err) {
                console.error(`Error reading name for cage ${i}:`, err);
            }
        }

        cages.push({
            id: i,
            name: cageName,
            imageUrl: imageUrl,
            lastWalkDays: lastWalkDays,
            walkedToday: walkedToday,
            hasMore: i < maxCages
        });
    }

    res.json({
        cages,
        hasMore: endId < maxCages,
        nextPage: endId < maxCages ? page + 1 : null
    });
});

// 견사별 산책 기록 저장 (POST)
app.use(express.json());


app.post('/cage/:id/walk', (req, res) => {
    const cageId = req.params.id;
    const { time } = req.body;
    if (!time) return res.status(400).json({ error: 'time 필요' });

    const filePath = path.join(walksDir, `cage_${cageId}_walks.json`);
    let walks = [];
    if (fs.existsSync(filePath)) {
        walks = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }

    // 고유 id 추가
    const walkId = uuidv4();
    walks.push({ id: walkId, time, cageId });

    if (walks.length > 20) {
        walks = walks.slice(-20); // 최근 20개만 남김
    }

    fs.writeFileSync(filePath, JSON.stringify(walks, null, 2));
    res.json({ success: true, id: walkId });
});

// 견사별 산책 기록 조회 (GET)
app.get('/cage/:id/walks', (req, res) => {
    const cageId = req.params.id;
    const filePath = path.join(walksDir, `cage_${cageId}_walks.json`);
    let walks = [];
    if (fs.existsSync(filePath)) {
        walks = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    res.json(walks);
});

// 견사 사진 업로드 (POST)
app.post('/cage/:id/upload', upload.single('image'), async (req, res) => {
    try {
        const cageId = req.params.id;

        if (!req.file) {
            return res.status(400).json({ error: '이미지 파일이 필요합니다.' });
        }

        // 원본 이미지 처리 (EXIF 회전 적용)
        const originalBuffer = await sharp(req.file.buffer)
            .rotate() // EXIF orientation 자동 처리
            .jpeg({ quality: 90 })
            .toBuffer();

        const originalKey = `${cageId}.jpeg`;
        const originalCommand = new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: originalKey,
            Body: originalBuffer,
            ContentType: 'image/jpeg',
            ACL: 'public-read'
        });
        await s3Client.send(originalCommand);

        // 썸네일 생성 (최대 400x400, 비율 유지, 80% 품질)
        const thumbnailBuffer = await sharp(req.file.buffer)
            .rotate() // EXIF orientation 자동 처리
            .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();

        // 썸네일 S3 업로드
        const thumbnailKey = `${cageId}_thumb.jpeg`;
        const thumbnailCommand = new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: thumbnailKey,
            Body: thumbnailBuffer,
            ContentType: 'image/jpeg',
            ACL: 'public-read'
        });
        await s3Client.send(thumbnailCommand);

        res.json({
            success: true,
            originalUrl: `${S3_BASE_URL}/${originalKey}`,
            thumbnailUrl: `${S3_BASE_URL}/${thumbnailKey}`
        });

    } catch (error) {
        console.error('S3 업로드 에러:', error);
        res.status(500).json({ error: '업로드 실패', details: error.message });
    }
});

// 견사별 강아지 목록 조회 (GET)
app.get('/cage/:id/dogs', (req, res) => {
    const cageId = req.params.id;
    const filePath = path.join(dogsDir, `cage_${cageId}_dogs.json`);
    let dogs = [];
    if (fs.existsSync(filePath)) {
        dogs = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    res.json(dogs);
});

// 견사에 강아지 추가 (POST)
app.post('/cage/:id/dogs', (req, res) => {
    const cageId = req.params.id;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name 필요' });

    const filePath = path.join(dogsDir, `cage_${cageId}_dogs.json`);
    let dogs = [];
    if (fs.existsSync(filePath)) {
        dogs = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }

    const dogId = uuidv4();
    dogs.push({ id: dogId, name, cageId });

    fs.writeFileSync(filePath, JSON.stringify(dogs, null, 2));
    res.json({ success: true, id: dogId });
});

// 견사의 강아지 이름 수정 (PUT)
app.put('/cage/:id/dogs/:dogId', (req, res) => {
    const cageId = req.params.id;
    const dogId = req.params.dogId;
    const { name } = req.body;

    if (!name) return res.status(400).json({ error: 'name 필요' });

    const filePath = path.join(dogsDir, `cage_${cageId}_dogs.json`);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: '강아지 목록이 없습니다.' });
    }

    let dogs = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const dogIndex = dogs.findIndex(d => d.id === dogId);

    if (dogIndex === -1) {
        return res.status(404).json({ error: '해당 강아지가 없습니다.' });
    }

    dogs[dogIndex].name = name;
    fs.writeFileSync(filePath, JSON.stringify(dogs, null, 2));
    res.json({ success: true });
});

// 견사에서 강아지 삭제 (DELETE)
app.delete('/cage/:id/dogs/:dogId', (req, res) => {
    const cageId = req.params.id;
    const dogId = req.params.dogId;
    const filePath = path.join(dogsDir, `cage_${cageId}_dogs.json`);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: '강아지 목록이 없습니다.' });
    }

    let dogs = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const newDogs = dogs.filter(d => d.id !== dogId);

    if (newDogs.length === dogs.length) {
        return res.status(404).json({ error: '해당 강아지가 없습니다.' });
    }

    fs.writeFileSync(filePath, JSON.stringify(newDogs, null, 2));
    res.json({ success: true });
});

// 강아지 사진 업로드 (POST)
app.post('/cage/:id/dogs/:dogId/photo', upload.single('image'), async (req, res) => {
    try {
        const cageId = req.params.id;
        const dogId = req.params.dogId;

        if (!req.file) {
            return res.status(400).json({ error: '이미지 파일이 필요합니다.' });
        }

        // 원본 이미지 처리 (EXIF 회전 적용)
        const originalBuffer = await sharp(req.file.buffer)
            .rotate() // EXIF orientation 자동 처리
            .jpeg({ quality: 90 })
            .toBuffer();

        const originalKey = `cage_${cageId}_dog_${dogId}.jpeg`;
        const originalCommand = new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: originalKey,
            Body: originalBuffer,
            ContentType: 'image/jpeg',
            ACL: 'public-read'
        });
        await s3Client.send(originalCommand);

        // 썸네일 생성 (최대 400x400, 비율 유지, 80% 품질)
        const thumbnailBuffer = await sharp(req.file.buffer)
            .rotate() // EXIF orientation 자동 처리
            .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();

        // 썸네일 S3 업로드
        const thumbnailKey = `cage_${cageId}_dog_${dogId}_thumb.jpeg`;
        const thumbnailCommand = new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: thumbnailKey,
            Body: thumbnailBuffer,
            ContentType: 'image/jpeg',
            ACL: 'public-read'
        });
        await s3Client.send(thumbnailCommand);

        res.json({
            success: true,
            originalUrl: `${S3_BASE_URL}/${originalKey}`,
            thumbnailUrl: `${S3_BASE_URL}/${thumbnailKey}`
        });

    } catch (error) {
        console.error('S3 업로드 에러:', error);
        res.status(500).json({ error: '업로드 실패', details: error.message });
    }
});

// 강아지별 산책 기록 조회 (GET)
app.get('/cage/:id/dogs/:dogId/walks', (req, res) => {
    const cageId = req.params.id;
    const dogId = req.params.dogId;
    const filePath = path.join(dogWalksDir, `cage_${cageId}_dog_${dogId}_walks.json`);
    let walks = [];
    if (fs.existsSync(filePath)) {
        walks = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    res.json(walks);
});

// 강아지별 산책 기록 저장 (POST)
app.post('/cage/:id/dogs/:dogId/walk', (req, res) => {
    const cageId = req.params.id;
    const dogId = req.params.dogId;
    const { time } = req.body;
    if (!time) return res.status(400).json({ error: 'time 필요' });

    const filePath = path.join(dogWalksDir, `cage_${cageId}_dog_${dogId}_walks.json`);
    let walks = [];
    if (fs.existsSync(filePath)) {
        walks = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }

    const walkId = uuidv4();
    walks.push({ id: walkId, time, cageId, dogId });

    if (walks.length > 20) {
        walks = walks.slice(-20); // 최근 20개만 남김
    }

    fs.writeFileSync(filePath, JSON.stringify(walks, null, 2));
    res.json({ success: true, id: walkId });
});

// 강아지별 산책 기록 삭제 (DELETE)
app.delete('/cage/:id/dogs/:dogId/walk/:walkId', (req, res) => {
    const cageId = req.params.id;
    const dogId = req.params.dogId;
    const walkId = req.params.walkId;
    const filePath = path.join(dogWalksDir, `cage_${cageId}_dog_${dogId}_walks.json`);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: '기록이 없습니다.' });
    }

    let walks = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const newWalks = walks.filter(w => w.id !== walkId);

    if (newWalks.length === walks.length) {
        return res.status(404).json({ error: '해당 산책 기록이 없습니다.' });
    }

    fs.writeFileSync(filePath, JSON.stringify(newWalks, null, 2));
    res.json({ success: true });
});

// 견사 이름 조회 (GET)
app.get('/cage/:id/name', (req, res) => {
    const cageId = req.params.id;
    const filePath = path.join(cageNamesDir, `cage_${cageId}_name.json`);

    if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        res.json({ name: data.name || `${cageId}번 견사` });
    } else {
        res.json({ name: `${cageId}번 견사` });
    }
});

// 견사 이름 저장 (PUT)
app.put('/cage/:id/name', (req, res) => {
    const cageId = req.params.id;
    const { name } = req.body;

    if (!name) return res.status(400).json({ error: 'name 필요' });

    const filePath = path.join(cageNamesDir, `cage_${cageId}_name.json`);
    const data = { name };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    res.json({ success: true });
});

// 통계 페이지 라우트
app.get('/statistics', (req, res) => {
    res.render('statistics');
});

// 통계 API (날짜 범위별 산책 데이터)
app.get('/api/statistics', (req, res) => {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate와 endDate 필요' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // 종료일 끝까지 포함

    const statisticsMap = new Map(); // dogId를 키로 하는 맵

    // 먼저 모든 강아지를 0으로 초기화
    const cageDogFiles = fs.readdirSync(dogsDir).filter(f => f.startsWith('cage_') && f.endsWith('_dogs.json'));
    cageDogFiles.forEach(file => {
        const match = file.match(/cage_(\d+)_dogs\.json/);
        if (!match) return;

        const cageId = match[1];

        // 견사 이름 가져오기
        let cageName = `${cageId}번 견사`;
        const nameFilePath = path.join(cageNamesDir, `cage_${cageId}_name.json`);
        if (fs.existsSync(nameFilePath)) {
            try {
                const nameData = JSON.parse(fs.readFileSync(nameFilePath, 'utf-8'));
                if (nameData.name) {
                    cageName = nameData.name;
                }
            } catch (err) {
                console.error(`Error reading name for cage ${cageId}:`, err);
            }
        }

        // 강아지들 가져오기
        const dogsFilePath = path.join(dogsDir, file);
        try {
            const dogs = JSON.parse(fs.readFileSync(dogsFilePath, 'utf-8'));
            dogs.forEach(dog => {
                statisticsMap.set(dog.id, {
                    dogId: dog.id,
                    dogName: dog.name || '이름 없음',
                    cageId: parseInt(cageId),
                    cageName,
                    walkCount: 0
                });
            });
        } catch (err) {
            console.error(`Error reading dogs for cage ${cageId}:`, err);
        }
    });

    // 모든 cage_dog_walks 파일 읽기
    const files = fs.readdirSync(dogWalksDir).filter(f => f.endsWith('_walks.json'));

    files.forEach(file => {
        // 파일명 패턴: cage_{cageId}_dog_{dogId}_walks.json
        const match = file.match(/cage_(\d+)_dog_(.+)_walks\.json/);
        if (!match) return;

        const dogId = match[2];
        const walksPath = path.join(dogWalksDir, file);

        try {
            const walks = JSON.parse(fs.readFileSync(walksPath, 'utf-8'));

            // 날짜 범위 내 산책 기록 필터링
            const filteredWalks = walks.filter(w => {
                const walkDate = new Date(w.time.replace(' ', 'T'));
                return walkDate >= start && walkDate <= end;
            });

            // 산책 카운트 증가 (강아지가 이미 Map에 있을 경우)
            if (statisticsMap.has(dogId)) {
                statisticsMap.get(dogId).walkCount += filteredWalks.length;
            }
        } catch (err) {
            console.error(`Error processing ${file}:`, err);
        }
    });

    // 맵을 배열로 변환
    const statistics = Array.from(statisticsMap.values());

    // 산책 횟수 기준 내림차순 정렬
    statistics.sort((a, b) => b.walkCount - a.walkCount);

    res.json(statistics);
});

// 서버 시작
app.listen(PORT, () => {
    console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다`);
});
