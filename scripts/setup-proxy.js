#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 .env 파일에서 프로젝트 ID를 읽어 Functions 환경변수를 설정합니다...\n');

const ensureTrailingNewline = (text) => (text.endsWith('\n') ? text : text + '\n');
const parseEnvToMap = (content) => {
  const map = new Map();
  (content || '').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return;
    const key = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim();
    map.set(key, value);
  });
  return map;
};
const upsertEnvVars = (existingContent, newVars, sectionTitle) => {
  let result = existingContent || '';
  result = ensureTrailingNewline(result);
  if (sectionTitle && !result.includes(sectionTitle)) {
    result += `\n${sectionTitle}\n`;
  }
  const existingMap = parseEnvToMap(result);
  Object.entries(newVars).forEach(([key, value]) => {
    if (value == null || value === '') return;
    if (!existingMap.has(key)) {
      result += `${key}=${value}\n`;
    } else {
      // 이미 키가 존재하지만 값이 비어있는 경우에는 값을 채워준다
      const regex = new RegExp(`^(${key})=\s*$`, 'm');
      if (regex.test(result)) {
        result = result.replace(regex, `$1=${value}`);
        console.log(`   ✏️  ${key}의 빈 값을 채웠습니다.`);
      } else {
        console.log(`   ⚠️  ${key}는 이미 존재합니다. 건너뜁니다.`);
      }
    }
  });
  return result;
};

// .env 파일 경로
const envPath = path.join(__dirname, '..', 'app', '.env');

// .env 파일에서 프로젝트 ID 읽기
if (!fs.existsSync(envPath)) {
  console.error('❌ app/.env 파일이 존재하지 않습니다.\n');
  console.log('📝 먼저 .env 파일을 생성하세요:');
  console.log('   cp app/.env.example app/.env');
  console.log('   # app/.env 파일에서 VITE_PROJECT_ID를 실제 프로젝트 ID로 수정');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const envMap = parseEnvToMap(envContent);
const projectId = envMap.get('VITE_PROJECT_ID');

if (!projectId) {
  console.error('❌ app/.env 파일에 VITE_PROJECT_ID가 설정되어 있지 않습니다.\n');
  console.log('📝 app/.env 파일에 다음 항목을 추가하세요:');
  console.log('   VITE_PROJECT_ID=your-firebase-project-id');
  process.exit(1);
}

console.log(`📋 Firebase 프로젝트: ${projectId}`);

// 환경변수 내용 생성 (Functions용)
const envVars = {
  VITE_FIREBASE_PROJECT_ID: projectId,
  VITE_FIREBASE_REGION: 'asia-northeast3',
  VITE_FUNCTIONS_URL_LOCAL: `http://localhost:5001/${projectId}/asia-northeast3`,
  VITE_FUNCTIONS_URL_PROD: `https://asia-northeast3-${projectId}.cloudfunctions.net`
};

let envFileContent = envContent;
envFileContent = upsertEnvVars(envFileContent, envVars, '# Firebase Functions 설정 (자동 생성)');

// .env 파일 저장
fs.writeFileSync(envPath, envFileContent);

console.log('✅ Functions 환경변수가 추가되었습니다:\n');
console.log(envFileContent);
console.log('🚀 이제 다음 명령어로 개발 서버를 시작할 수 있습니다:');
console.log('   1. pnpm serve    # BE 서버 실행 (Firebase Emulator)');
console.log('   2. pnpm dev      # FE 개발 서버 실행 (새 터미널에서)');
