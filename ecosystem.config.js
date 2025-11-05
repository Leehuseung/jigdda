module.exports = {
    apps: [
        {
            name: "jigdda",          // PM2에서 표시될 앱 이름
            script: "app.js",        // 실행할 메인 파일
            instances: 1,            // 프로세스 개수 (1이면 싱글 프로세스)
            exec_mode: "fork",       // 실행 모드 (cluster 또는 fork)
            watch: false             // 파일 변경 시 자동 재시작 여부
        }
    ]
};

