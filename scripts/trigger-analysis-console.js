/**
 * Browser Console Command to Trigger AI Analysis for All Users
 * 
 * Usage:
 * 1. Open AI Insights page (http://localhost:8080/ai-insights)
 * 2. Open browser console (F12)
 * 3. Paste this entire script and press Enter
 * 4. Monitor progress in console
 */

(async function analyzeAllUsersToday() {
  console.log('🧠 Starting AI Analysis for all users (today)...\n');
  
  // Import Supabase client from the page context
  const { createClient } = window.supabase || await import('https://esm.sh/@supabase/supabase-js@2');
  
  // Get credentials from the current page's context
  const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || 
                      document.querySelector('[data-supabase-url]')?.dataset.supabaseUrl;
  const supabaseKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Could not find Supabase credentials');
    console.log('💡 Make sure you are on the AI Insights page');
    return;
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Get all users
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, full_name')
      .not('email', 'ilike', '%@example.com%')
      .order('full_name');
    
    if (error) throw error;
    
    if (!users || users.length === 0) {
      console.log('⚠️  No users found');
      return;
    }
    
    console.log(`📊 Found ${users.length} users to analyze\n`);
    
    let successCount = 0;
    let errorCount = 0;
    
    // Get today's start
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfDay = today.toISOString();
    
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      console.log(`[${i + 1}/${users.length}] ${user.full_name}...`);
      
      try {
        // Check for screenshots
        const { count } = await supabase
          .from('screenshots')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('captured_at', startOfDay);
        
        if (!count || count === 0) {
          console.log(`  ⏭️  No screenshots today`);
          continue;
        }
        
        console.log(`  📸 ${count} screenshot(s)`);
        
        // Trigger analysis
        const { data, error: analysisError } = await supabase.functions.invoke(
          'comprehensive-employee-analysis',
          {
            body: {
              user_id: user.id,
              generate_ai_summary: true
            }
          }
        );
        
        if (analysisError) throw analysisError;
        
        console.log(`  ✅ Complete (Score: ${data?.productivity_score || 'N/A'}%)`);
        successCount++;
        
        // Delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 1000));
        
      } catch (err) {
        console.error(`  ❌ Error: ${err.message}`);
        errorCount++;
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${errorCount}`);
    console.log(`⏭️  Skipped: ${users.length - successCount - errorCount}`);
    console.log('\n✨ Refresh the page to see updated insights!');
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
  }
})();
