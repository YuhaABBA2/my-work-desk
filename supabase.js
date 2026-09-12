// publishable key 만 사용한다. service_role 키는 절대 여기에 두지 않는다.
const supabaseUrl = 'https://skihcfyndumifhaxamas.supabase.co';
const supabaseKey = 'sb_publishable_6igMLFNC7cYgN2gCjwUvpg_mYcsFN4B';
export const sb = window.supabase.createClient(supabaseUrl, supabaseKey);
