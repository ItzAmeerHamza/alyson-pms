
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/components/ui/use-toast";
import EbdaaTimeLogo from "@/components/ui/timeflow-logo";
import DesktopDownload from "@/components/ui/desktop-download";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Loader2, Building2 } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { loginFormSchema, type LoginFormValues } from "@/lib/schemas";
import { sanitizeInput, validateAndSanitizeEmail } from "@/components/security/input-sanitizer";

const formSchema = loginFormSchema;

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [organizationValidated, setOrganizationValidated] = useState(false);
  const [organizationName, setOrganizationName] = useState<string | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      company: "ebdaadt",
      email: "",
      password: "",
      rememberMe: false,
    },
  });

  // Validate organization when company field changes
  async function validateOrganization(slug: string) {
    if (!slug) {
      setOrganizationValidated(false);
      setOrganizationName(null);
      return;
    }

    try {
      const sanitizedSlug = sanitizeInput(slug).toLowerCase().trim();
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, slug, logo_url, is_active')
        .eq('slug', sanitizedSlug)
        .single();

      if (error || !data || !data.is_active) {
        setOrganizationValidated(false);
        setOrganizationName(null);
        return;
      }

      setOrganizationValidated(true);
      setOrganizationName(data.name);
    } catch (error) {
      setOrganizationValidated(false);
      setOrganizationName(null);
    }
  }

  async function onSubmit(values: LoginFormValues) {
    setIsLoading(true);
    try {
      const sanitizedCompany = sanitizeInput(values.company).toLowerCase().trim();
      const sanitizedEmail = validateAndSanitizeEmail(values.email);

      if (!sanitizedEmail) {
        throw new Error("Invalid credentials. Please check and try again.");
      }

      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('id, name, slug, logo_url, is_active')
        .eq('slug', sanitizedCompany)
        .single();

      if (orgError || !orgData || !orgData.is_active) {
        throw new Error("Invalid credentials. Please check and try again.");
      }

      await signIn(sanitizedEmail, values.password, values.rememberMe, sanitizedCompany);
      
      navigate("/");
    } catch (error: any) {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Login Card */}
          <div className="flex justify-center">
            <Card className="w-full max-w-md">
              <CardHeader className="space-y-1 text-center">
                <div className="flex justify-center mb-4">
                  <EbdaaTimeLogo size={60} showText={true} />
                </div>
                <CardDescription>
                  Enter your credentials to access your account
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="company"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            Company
                          </FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="ebdaadt" 
                              {...field} 
                              onChange={(e) => {
                                field.onChange(e);
                                validateOrganization(e.target.value);
                              }}
                            />
                          </FormControl>
                          {organizationValidated && organizationName && (
                            <p className="text-sm text-green-600 dark:text-green-400">
                              ✓ {organizationName}
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input placeholder="your.email@example.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="••••••••" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex items-center justify-between">
                      <FormField
                        control={form.control}
                        name="rememberMe"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal cursor-pointer">
                              Remember me
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                      <Link
                        to="/auth/forgot-password"
                        className="text-sm text-primary hover:underline"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Signing In...
                        </>
                      ) : (
                        "Sign In"
                      )}
                    </Button>
                  </form>
                </Form>
              </CardContent>
              <CardFooter className="flex flex-col space-y-4">
                <p className="text-sm text-muted-foreground text-center">
                  Don't have an account? Contact your administrator.
                </p>
              </CardFooter>
            </Card>
          </div>

          {/* Desktop Download */}
          <div className="flex justify-center">
            <DesktopDownload variant="full" />
          </div>
        </div>
      </div>
    </div>
  );
}
