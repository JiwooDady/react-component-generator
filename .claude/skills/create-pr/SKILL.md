---
name: create-pr
description: Use when user wants to create a pull request or write a PR description for current changes. Make sure to use this skill whenever the user says "PR 만들어줘", "풀리퀘 올려줘", "create a pull request", "open a PR", or asks for a PR title/body, even if they don't mention the skill by name.
context: fork
---

# Create PR

현재 브랜치의 변경사항을 분석해 PR 본문을 작성하고 GitHub Pull Request를 생성한다. `context: fork`로 별도 서브 에이전트에서 실행되므로, 끝나면 PR URL, 사용한 언어와 판단 근거, 포함된 커밋 수만 간결하게 보고한다.

## 절차

### 1. 사전 확인
- `git rev-parse --is-inside-work-tree`로 git 저장소인지 확인한다. 아니면 이유를 알리고 중단한다.
- 현재 브랜치(`git branch --show-current`)와 기본 브랜치(`gh repo view --json defaultBranchRef -q .defaultBranchRef.name`)를 확인한다.
- 현재 브랜치가 기본 브랜치면 중단하고 작업 브랜치를 먼저 만들도록 안내한다. PR은 기본 브랜치 자신에서 만들 수 없고, 기본 브랜치로 직접 push하는 일도 피해야 한다.
- `git status --short`로 커밋되지 않은 변경을 확인한다. 있으면 PR에 포함되지 않는다는 점을 최종 보고에 적는다. 대신 커밋하지 않는다.
- `gh auth status`로 인증을 확인한다. 실패하면 `gh auth login`을 안내하고 중단한다.

### 2. 변경 분석
- `git log <기본브랜치>..HEAD --oneline`으로 PR에 포함될 커밋을 확인한다.
- `git diff <기본브랜치>...HEAD --stat`과 `git diff <기본브랜치>...HEAD`로 실제 변경을 읽는다. 커밋 메시지가 아니라 diff 기준으로 무엇이 왜 바뀌었는지 파악한다.
- 비밀 값(`.env`, 키, 토큰)이 diff에 있으면 PR을 만들지 않고 알린다. PR은 공개될 수 있고 한 번 올라가면 회수하기 어렵다.

### 3. 템플릿 언어 선택
저장소 이름이 아니라 **프로젝트가 어느 언어권의 프로젝트인지**로 판단한다. 아래 신호를 모아 한글이 우세하면 한국어, 그렇지 않으면 영어를 쓴다.

1. 최근 커밋 메시지: `git log -20 --format=%s`
2. 기존 PR 제목: `gh pr list --state all --limit 10 --json title -q '.[].title'`
3. `README.md`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`의 본문 언어
4. 이슈·PR 템플릿(`.github/`)이 있으면 그 언어

판단 기준:
- 신호 대부분에 한글이 쓰였으면 **한국 프로젝트**로 보고 한국어 템플릿을 쓴다.
- 영어 위주이거나 외부 기여자를 받는 해외 오픈소스 프로젝트로 보이면 영어 템플릿을 쓴다.
- 신호가 섞이거나 부족하면 가장 최근 커밋과 기존 PR의 언어를 따른다. 그래도 정할 수 없으면 영어를 쓴다. 읽는 사람의 범위를 알 수 없을 때는 더 넓게 읽히는 쪽이 안전하다.
- 사용자가 언어를 직접 요청했으면("영어로", "in Korean") 그 요청이 우선이다.

| 언어 | 템플릿 파일 |
| --- | --- |
| 한국어 | `references/pr-template.ko.md` |
| 영어 | `references/pr-template.en.md` |

- 고른 언어의 파일 하나만 읽는다. PR 제목도 같은 언어로 쓴다.
- 저장소에 `.github/pull_request_template.md`가 이미 있으면 그 파일이 우선이다. 프로젝트가 정한 형식을 존중하고 이 스킬의 템플릿은 쓰지 않는다.

### 4. PR 본문 작성
- 선택한 템플릿을 읽어 채운다.
- 제목은 `<type>: <요약>` 형식(type: feat, fix, refactor, chore, docs, test), 70자 이내, 마침표 없음. 기존 PR 제목에 다른 컨벤션이 있으면 그것을 따른다.
- 변경 요약은 "무엇을, 왜" 중심으로 쓴다. 파일 목록을 그대로 나열하지 않는다.
- 테스트 항목에는 실제로 실행한 명령과 결과만 적는다. 실행하지 않은 것을 체크하면 리뷰어가 잘못된 확신을 갖는다.
- 해당 없는 섹션은 지우지 말고 "해당 없음"(영어는 "N/A")으로 적는다.
- 본문 마지막에 시스템 안내에 PR 설명 마무리 문구가 있으면 그대로 붙인다.

### 5. 생성
- 원격에 브랜치가 없거나 뒤처져 있으면 `git push -u origin <현재브랜치>`로 올린다. force push는 하지 않는다.
- 본문은 파일로 저장하고 `--body-file`로 전달한다. 줄바꿈과 특수문자가 깨지지 않는다.
- `gh pr create --base <기본브랜치> --title "<제목>" --body-file <파일>`을 실행한다.
- 같은 브랜치에 열린 PR이 이미 있으면(`gh pr view`) 새로 만들지 않고 URL만 알린다. 본문 수정은 사용자가 요청할 때만 `gh pr edit`로 한다.
- 임시 본문 파일은 생성 후 삭제한다.

## 하지 않는 것
- 기본 브랜치로의 push, force push, hook 우회(`--no-verify`).
- 커밋되지 않은 변경을 대신 커밋하는 일.
- 리뷰어 지정, 라벨, 머지(사용자가 요청한 경우만).
