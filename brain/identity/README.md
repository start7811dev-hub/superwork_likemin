# identity/

MPM 판단 엔진의 근거가 되는 **MIN의 자기 분석 · 방법론 원문**이 들어가는 곳입니다.

- 이 폴더의 `*.md`는 공개 저장소에 올리지 않습니다 (`.gitignore`).
- 릴리스 빌드(`.github/workflows/release.yml`)는 GitHub Secrets `MIN_IDENTITY_01_B64`, `MIN_IDENTITY_02_B64`를 디코드해 이 폴더에 넣은 뒤 설치파일을 만듭니다.
- 로컬 개발 시에는 원문 파일을 이 폴더에 직접 두면 됩니다.

```bash
# 원문을 바꾼 뒤 Secrets 갱신
gh secret set MIN_IDENTITY_01_B64 --body "$(base64 -i brain/identity/01-min-introduce.md)"
gh secret set MIN_IDENTITY_02_B64 --body "$(base64 -i brain/identity/02-min-skill.md)"
```
