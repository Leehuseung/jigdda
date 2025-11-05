const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const imgDir = path.join(__dirname, 'public', 'img');
const files = fs.readdirSync(imgDir);

files.forEach(file => {
    // 1.jpeg, 2.jpeg 등만 처리
    if (/^\d+\.jpeg$/.test(file)) {
        const id = file.split('.')[0];
        const inputPath = path.join(imgDir, file);
        const outputPath = path.join(imgDir, `${id}_thumb.jpeg`);
        if (fs.existsSync(outputPath)) {
            console.log(`${outputPath} 이미 존재, 건너뜀`);
            return;
        }
        sharp(inputPath)
            .resize(96, 96) // 원하는 썸네일 크기(px)
            .jpeg({ quality: 60 }) // 화질(품질) 조정
            .toFile(outputPath)
            .then(() => console.log(`${outputPath} 생성됨`))
            .catch(err => console.error(err));
    }
});
