# 나의 업무판 배포 순서

1. 이 `my-work-desk` 폴더를 GitHub 저장소에 올립니다.
2. Vercel에서 **Add New → Project**를 누르고 해당 저장소를 Import 합니다.
3. Framework Preset은 **Other**, Build Command와 Output Directory는 비워 둔 채 Deploy 합니다.
4. 생성된 `https://...vercel.app` 주소를 Supabase Dashboard의 **Authentication → URL Configuration**에서 Site URL 및 Redirect URLs에 등록합니다.
5. Supabase Dashboard의 **Authentication → Sign In / Providers → Google**에서 Google을 활성화하고, Google Cloud에서 발급한 Client ID와 Client Secret을 입력합니다.

Google Cloud OAuth 클라이언트 설정:

- Authorized JavaScript origins: Vercel 주소 (예: `https://my-work-desk.vercel.app`)
- Authorized redirect URI: `https://skihcfyndumifhaxamas.supabase.co/auth/v1/callback`

배포 후 Vercel 주소에서 Google 로그인 → 일정 추가 → 다른 기기에서 같은 계정으로 로그인해 동기화를 확인합니다.
