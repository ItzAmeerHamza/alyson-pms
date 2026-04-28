-- Screenshot comments table for team leaders and admins
CREATE TABLE IF NOT EXISTS public.screenshot_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  screenshot_id UUID NOT NULL REFERENCES public.screenshots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_screenshot_comments_screenshot ON public.screenshot_comments(screenshot_id);
CREATE INDEX idx_screenshot_comments_user ON public.screenshot_comments(user_id);

-- RLS
ALTER TABLE public.screenshot_comments ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read comments
CREATE POLICY "Anyone can read comments" ON public.screenshot_comments
  FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to insert their own comments
CREATE POLICY "Users can add comments" ON public.screenshot_comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own comments
CREATE POLICY "Users can update own comments" ON public.screenshot_comments
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Allow users to delete their own comments
CREATE POLICY "Users can delete own comments" ON public.screenshot_comments
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
