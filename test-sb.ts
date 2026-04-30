import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
    db: { schema: 'features' }
});

async function test() {
    const { data: roster, error: rErr } = await supabase.from('roster_view').select('*').limit(1);
    if (rErr) console.error(rErr);
    console.log('Roster View Schema:', roster);

    const { data: headhunter, error: hErr } = await supabase.from('headhunter_view').select('*').limit(1);
    if (hErr) console.error(hErr);
    console.log('Headhunter View Schema:', headhunter);
}

test();
