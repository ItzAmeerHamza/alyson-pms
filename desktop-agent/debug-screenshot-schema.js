#!/usr/bin/env node

/**
 * Quick debug script to check the actual columns in the screenshots table
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkScreenshotsTable() {
    console.log('🔍 CHECKING SCREENSHOTS TABLE SCHEMA');
    console.log('='.repeat(50));
    
    try {
        // Try to get any row to see the actual column structure
        const { data, error } = await supabase
            .from('screenshots')
            .select('*')
            .limit(1);
            
        if (error) {
            console.error('❌ Error querying screenshots:', error.message);
            return;
        }
        
        if (data.length > 0) {
            console.log('✅ Found screenshot data!');
            console.log('📋 Available columns:');
            Object.keys(data[0]).forEach(column => {
                console.log(`   - ${column}: ${typeof data[0][column]} (${data[0][column]})`);
            });
        } else {
            console.log('💡 No screenshots found, but table exists');
            
            // Try to get column info using a different approach
            const { data: schemaData, error: schemaError } = await supabase
                .rpc('get_table_columns', { table_name: 'screenshots' });
                
            if (!schemaError && schemaData) {
                console.log('📋 Table columns from schema:');
                schemaData.forEach(col => {
                    console.log(`   - ${col.column_name}: ${col.data_type}`);
                });
            }
        }
        
        // Try different column names to see which ones exist
        const possibleTimestampColumns = ['timestamp', 'captured_at', 'created_at'];
        
        for (const col of possibleTimestampColumns) {
            try {
                const { data: testData, error: testError } = await supabase
                    .from('screenshots')
                    .select(col)
                    .limit(1);
                    
                if (!testError) {
                    console.log(`✅ Column '${col}' exists`);
                } else {
                    console.log(`❌ Column '${col}' does not exist: ${testError.message}`);
                }
            } catch (err) {
                console.log(`❌ Column '${col}' test failed: ${err.message}`);
            }
        }
        
    } catch (err) {
        console.error('💥 Script error:', err.message);
    }
}

checkScreenshotsTable().then(() => {
    console.log('\n✅ Schema check complete');
    process.exit(0);
}).catch(err => {
    console.error('💥 Fatal error:', err.message);
    process.exit(1);
});
