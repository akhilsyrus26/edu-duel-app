import { createClient } from '@supabase/supabase-js'
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing credentials in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function checkConnection() {
  console.log(`Checking connection to: ${supabaseUrl}`)
  const { data, error } = await supabase.from('profiles').select('*').limit(1)
  
  if (error) {
    if (error.code === 'PGRST116') {
      console.log('✅ Connection successful! (Table exists but is empty)')
    } else if (error.message.includes('relation "public.profiles" does not exist')) {
      console.error('❌ Connection successful, but "profiles" table NOT found. Did you run the SQL script?')
    } else {
      console.error('❌ Connection failed:', error.message)
    }
  } else {
    console.log('✅ Connection successful! Found data:', data)
  }
}

checkConnection()
