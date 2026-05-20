import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

export default function ConfirmPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  // Extract URL params once to use as stable values
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as 'signup' | 'recovery' | 'invite' | 'magiclink' | 'email_change';
  
  // Track the last verified token to prevent duplicate calls with same params
  const lastVerifiedToken = useRef<string | null>(null);

  useEffect(() => {
    // Skip if already verified with this token
    if (lastVerifiedToken.current === tokenHash) return;
    lastVerifiedToken.current = tokenHash;
    
    async function verifyToken() {
      if (!tokenHash || !type) {
        setStatus('error');
        setMessage('Invalid confirmation link. Missing token or type.');
        return;
      }

      try {
        // For recovery type, redirect to reset password page
        if (type === 'recovery') {
          navigate(`/auth/reset-password?token_hash=${tokenHash}&type=recovery`);
          return;
        }

        // Map type to valid verifyOtp types
        // Valid types: 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email'
        const otpTypeMap: Record<string, 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email'> = {
          signup: 'signup',
          invite: 'invite',
          magiclink: 'magiclink',
          recovery: 'recovery',
          email_change: 'email_change',
          email: 'email',
        };
        
        const otpType = otpTypeMap[type] || 'email';
        
        // Verify the OTP token
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: otpType,
        });

        if (error) {
          console.error('Verification error:', error);
          setStatus('error');
          setMessage(error.message || 'Failed to verify. The link may have expired.');
          return;
        }

        console.log('Verification successful:', data);
        setStatus('success');

        // Set appropriate success message based on type
        switch (type) {
          case 'signup':
            setMessage('Your email has been confirmed! You can now log in.');
            break;
          case 'invite':
            setMessage('Invitation accepted! Redirecting to set your password...');
            // For invites, redirect to reset password to set initial password
            setTimeout(() => navigate('/auth/reset-password'), 2000);
            return;
          case 'email_change':
            setMessage('Your email has been updated successfully!');
            break;
          case 'magiclink':
            setMessage('Login successful! Redirecting...');
            setTimeout(() => navigate('/'), 2000);
            return;
          default:
            setMessage('Verification successful!');
        }

        // Redirect to login after delay for most types
        setTimeout(() => navigate('/auth/login'), 3000);

      } catch (err: any) {
        console.error('Confirmation error:', err);
        setStatus('error');
        setMessage(err.message || 'An unexpected error occurred.');
      }
    }

    verifyToken();
  }, [tokenHash, type, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>
            {status === 'loading' && 'Verifying...'}
            {status === 'success' && 'Success!'}
            {status === 'error' && 'Verification Failed'}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-muted-foreground">Please wait while we verify your request...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center gap-4">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <p className="text-green-600">{message}</p>
              <Button onClick={() => navigate('/auth/login')}>
                Go to Login
              </Button>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-4">
              <XCircle className="h-12 w-12 text-red-500" />
              <p className="text-red-600">{message}</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => navigate('/auth/login')}>
                  Go to Login
                </Button>
                <Button onClick={() => window.location.reload()}>
                  Try Again
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

