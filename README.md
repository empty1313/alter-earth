# 🌍 ALTER-EARTH (얼터-어스)

**ALTER-EARTH**는 **GEMINI 2.5 PRO**를 활용하여 생성된 창작 TRPG(Tabletop Role-Playing Game) 세계관 프로젝트입니다. 
세계관 설정부터 던전 데이터 관리, 몬스터 정보 출력까지 TRPG 운영에 필요한 다양한 웹 툴과 데이터베이스를 포함하고 있습니다.

<br/>

## 🔗 웹 페이지 및 툴 링크 (Web Tools)

웹 툴(ARACHNE-WEB, MARS) 접근 시 비밀번호가 필요합니다.
> 🔒 **통합 접속 비밀번호:** `7707`

* 📖 **세계관 설명 페이지 (INFO):** [바로가기](https://empty1313.github.io/alter-earth/info/)
* 🕸️ **ARACHNE-WEB (던전 구조 뷰어):** [바로가기](https://empty1313.github.io/alter-earth/arachne-web/)
  * 던전 데이터를 **던전의 구조(맵) 중심**으로 시각화하여 보여주는 웹 도구입니다.
* 👾 **MARS (오브젝트 뷰어):**[바로가기](https://empty1313.github.io/alter-earth/mars/)
  * 던전 데이터를 **오브젝트(몬스터 등) 중심**으로 보여주는 웹 도구입니다.

<br/>

## 📁 프로젝트 구조 (Directory Structure)

```text
📦 alter-earth
 ┣ 📂 arachne-web  # 던전 구조 중심의 데이터 출력 웹사이트 파일
 ┣ 📂 mars         # 오브젝트(몬스터) 중심의 데이터 출력 웹사이트 파일
 ┣ 📂 info         # ALTER-EARTH 세계관 소개 웹사이트 파일
 ┣ 📂 database     # 프로젝트 DB 폴더 (상세 내용은 'DATABASE/DB개선툴/db 개선.xlsx' 참고)
 ┣ 📂 운영지원     # 운영 자동화 및 프롬프트 관리 폴더
 ┗ 📂 legacy       # 구버전 ARACHNE-WEB 및 MARS 백업 파일
```

<br/>

## 🛠️ 주요 기능 및 운영 도구 (Features & Tools)

* **TRPG 세계관 및 데이터 구축:** Gemini 2.5 Pro 모델을 통해 생성된 체계적인 TRPG 설정과 데이터를 관리합니다.
* **웹 기반 데이터 시각화:** 플레이어와 마스터(GM)가 복잡한 던전 구조 및 몬스터 정보를 직관적으로 파악할 수 있도록 돕습니다.
* **운영지원 툴 (`DB_editor_v2.5.py`):**
  * 제미나이(Gemini)가 생성한 DB 텍스트 답변을 복사하여 붙여넣으면, **자동으로 데이터를 추출하여 기존 DB에 통합 및 저장**해 주는 파이썬(Python) 기반 자동화 스크립트입니다.
  * 해당 폴더에는 콘텐츠 생성, DB 관리, TRPG 판정 시스템과 관련된 다양한 프롬프트 파일도 함께 포함되어 있습니다.

<br/>

## 💻 기술 스택 (Tech Stack)

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
