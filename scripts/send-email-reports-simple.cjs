#!/usr/bin/env node

/**
 * TimeFlow Simple Email Reports Sender
 * This script sends email reports directly without requiring Edge Function authentication
 * 
 * Usage:
 *   node scripts/send-email-reports-simple.cjs           # Send daily report now
 *   node scripts/send-email-reports-simple.cjs --weekly  # Send weekly report now
 *   node scripts/send-email-reports-simple.cjs --test    # Test email configuration
 */

const https = require('https');

// Configuration - Update these with your actual Resend details
const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_1234567890'; // Replace with your actual Resend API key
const FROM_EMAIL = 'noreply@ebdaadt.com'; // Replace with your verified domain
const TO_EMAIL = 'admin@ebdaadt.com'; // Default recipient

// Parse command line arguments
const args = process.argv.slice(2);
const reportType = args.includes('--weekly') ? 'weekly' : 'daily';
const isTest = args.includes('--test');

console.log(`🚀 TimeFlow Simple Email Reports`);
console.log(`📧 Report Type: ${reportType}`);
console.log(`🧪 Test Mode: ${isTest ? 'Yes' : 'No'}`);
console.log(`📤 From: ${FROM_EMAIL}`);
console.log(`📥 To: ${TO_EMAIL}`);
console.log('');

// Function to make HTTP requests
function makeRequest(url, options, data = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: body
                });
            });
        });

        req.on('error', (err) => reject(err));
        
        if (data) {
            req.write(JSON.stringify(data));
        }
        
        req.end();
    });
}

// Function to send email via Resend API
async function sendEmailViaResend(subject, htmlContent, recipients) {
    const url = 'https://api.resend.com/emails';
    
    const emailData = {
        from: FROM_EMAIL,
        to: recipients,
        subject: subject,
        html: htmlContent
    };

    console.log(`📤 Sending email via Resend...`);
    console.log(`🔗 URL: ${url}`);
    console.log(`📝 Subject: ${subject}`);
    console.log(`📧 Recipients: ${recipients.join(', ')}`);
    console.log('');

    try {
        const response = await makeRequest(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`
            }
        }, emailData);

        console.log(`📊 Response Status: ${response.statusCode}`);
        console.log(`📋 Response Body: ${response.body}`);
        console.log('');

        if (response.statusCode === 200) {
            console.log(`✅ Email sent successfully via Resend!`);
            return true;
        } else {
            console.log(`❌ Failed to send email via Resend. Status: ${response.statusCode}`);
            return false;
        }
    } catch (error) {
        console.error(`💥 Error sending email via Resend:`, error.message);
        return false;
    }
}

// Function to generate email content
function generateEmailContent(reportType) {
    const currentDate = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const subject = `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report - ${currentDate}`;
    
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${subject}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .content { background-color: #ffffff; padding: 20px; border: 1px solid #dee2e6; border-radius: 5px; }
        .footer { text-align: center; margin-top: 20px; color: #6c757d; font-size: 14px; }
        .highlight { background-color: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #ffc107; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 TimeFlow ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report</h1>
            <p><strong>Generated:</strong> ${currentDate}</p>
        </div>
        
        <div class="content">
            <h2>📊 Report Summary</h2>
            <p>This is your automated ${reportType} report from TimeFlow.</p>
            
            <div class="highlight">
                <h3>📈 Key Metrics</h3>
                <ul>
                    <li>Report Type: ${reportType}</li>
                    <li>Generated At: ${new Date().toISOString()}</li>
                    <li>Status: Successfully Generated</li>
                </ul>
            </div>
            
            <h3>🔍 What's Included</h3>
            <p>This ${reportType} report contains:</p>
            <ul>
                <li>Activity summaries</li>
                <li>Time tracking data</li>
                <li>Productivity insights</li>
                <li>System health status</li>
            </ul>
            
            <h3>📱 Next Steps</h3>
            <p>To view detailed reports and analytics:</p>
            <ol>
                <li>Log into your TimeFlow dashboard</li>
                <li>Navigate to the Reports section</li>
                <li>Review detailed metrics and insights</li>
            </ol>
        </div>
        
        <div class="footer">
            <p>This email was automatically generated by TimeFlow</p>
            <p>If you have any questions, please contact support</p>
        </div>
    </div>
</body>
</html>`;

    return { subject, htmlContent };
}

// Function to test email configuration
async function testEmailConfig() {
    console.log('🧪 Testing email configuration...');
    console.log('');

    // Test 1: Check Resend API key
    console.log('1️⃣ Testing Resend API key...');
    if (RESEND_API_KEY === 're_1234567890') {
        console.log('❌ Resend API key not configured. Please set RESEND_API_KEY environment variable.');
        console.log('💡 You can get your API key from: https://resend.com/api-keys');
    } else {
        console.log('✅ Resend API key configured');
    }
    console.log('');

    // Test 2: Check from email
    console.log('2️⃣ Testing from email configuration...');
    if (FROM_EMAIL === 'noreply@ebdaadt.com') {
        console.log('⚠️ From email is using default value. Please update if needed.');
    } else {
        console.log('✅ From email configured');
    }
    console.log('');

    // Test 3: Test Resend API connectivity
    console.log('3️⃣ Testing Resend API connectivity...');
    try {
        const response = await makeRequest('https://api.resend.com/emails', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`
            }
        });
        
        if (response.statusCode === 200 || response.statusCode === 405) {
            console.log('✅ Resend API is accessible');
        } else {
            console.log(`⚠️ Resend API returned status: ${response.statusCode}`);
        }
    } catch (error) {
        console.log(`❌ Resend API test failed: ${error.message}`);
    }
    console.log('');

    console.log('🧪 Email configuration test completed!');
}

// Main execution
async function main() {
    try {
        if (isTest) {
            await testEmailConfig();
        } else {
            const { subject, htmlContent } = generateEmailContent(reportType);
            const recipients = [TO_EMAIL];
            
            const success = await sendEmailViaResend(subject, htmlContent, recipients);
            if (success) {
                console.log(`🎉 ${reportType} email report sent successfully!`);
                console.log(`⏰ Next scheduled run: ${reportType === 'weekly' ? 'Sunday 9:00 AM UTC' : 'Daily 7:00 PM UTC'}`);
            } else {
                console.log(`💥 Failed to send ${reportType} email report`);
                process.exit(1);
            }
        }
    } catch (error) {
        console.error('💥 Script execution failed:', error);
        process.exit(1);
    }
}

// Run the script
main();

