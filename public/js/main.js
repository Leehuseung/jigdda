document.addEventListener('DOMContentLoaded', async () => {
    const dogItems = document.querySelectorAll('.dog-item');
    const searchInput = document.getElementById('search-input');
    const clearSearch = document.getElementById('clear-search');  // X 아이콘
    const photoModal = document.getElementById('photo-modal');
    const modalImg = document.getElementById('modal-img');

    // ✅ /dogs API에서 산책시간 포함 데이터 불러오기
    const dogs = await fetch('/dogs').then(res => res.json());
    dogItems.forEach(item => {
        const id = Number(item.getAttribute('data-index'));
        const dog = dogs.find(d => d.id === id);
        if (dog && dog.walkTime) {
            const timeSpan = item.querySelector('.walk-time');
            timeSpan.textContent = dog.walkTime;
            timeSpan.style.color = 'green';
            item.classList.add('walked');
        }
    });

    // ✅ 클릭 이벤트 (산책/산책취소 로직)
    dogItems.forEach(item => {
        item.addEventListener('click', async () => {
            const name = item.querySelector('.dog-name').textContent;
            const id = Number(item.getAttribute('data-index'));
            const isWalked = item.classList.contains('walked');

            if (isWalked) {
                // 산책 취소
                const confirmResult = await Swal.fire({
                    title: `${name}의 산책을 취소할까요?`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: '네, 취소할게요!',
                    cancelButtonText: '아니요'
                });
                if (confirmResult.isConfirmed) {
                    await fetch(`/walks/${id}`, { method: 'DELETE' });
                    const timeSpan = item.querySelector('.walk-time');
                    timeSpan.textContent = '';
                    item.classList.remove('walked');
                }
            } else {
                // 산책 등록
                const confirmResult = await Swal.fire({
                    title: `${name}을(를) 산책시킬까요?`,
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: '네, 산책할게요!',
                    cancelButtonText: '아니요'
                });
                if (confirmResult.isConfirmed) {
                    const now = new Date();
                    const hours = now.getHours().toString().padStart(2, '0');
                    const minutes = now.getMinutes().toString().padStart(2, '0');
                    const formattedTime = `${hours}:${minutes}`;
                    await fetch('/walks', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id, time: formattedTime })
                    });
                    const timeSpan = item.querySelector('.walk-time');
                    timeSpan.textContent = formattedTime;
                    timeSpan.style.color = 'green';
                    item.classList.add('walked');
                }
            }
        });
    });

    // ✅ 검색 기능
    searchInput.addEventListener('input', () => {
        const keyword = searchInput.value.trim().toLowerCase();
        dogItems.forEach(item => {
            const name = item.querySelector('.dog-name').textContent.toLowerCase();
            if (name.includes(keyword)) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
        if (searchInput.value !== '') {
            clearSearch.style.display = 'block';
        } else {
            clearSearch.style.display = 'none';
        }
    });
    clearSearch.addEventListener('click', () => {
        searchInput.value = '';
        clearSearch.style.display = 'none';
        dogItems.forEach(item => item.style.display = '');
    });

    // 강아지 사진 클릭 시 확대
    document.querySelectorAll('.dog-photo').forEach(img => {
        img.addEventListener('click', e => {
            e.stopPropagation(); // 부모(li) 클릭 방지
            // S3 경로에서 _thumb 제거하여 원본 경로로 변경
            const originalSrc = img.src.replace('_thumb.jpeg', '.jpeg');
            modalImg.src = originalSrc;
            photoModal.style.display = 'flex';
        });
    });
    // 모달 클릭 시 닫기
    photoModal.addEventListener('click', () => {
        photoModal.style.display = 'none';
        modalImg.src = '';
    });
});
