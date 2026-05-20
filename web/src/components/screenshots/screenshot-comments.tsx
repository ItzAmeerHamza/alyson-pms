import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, Send, Pencil, Trash2, X, Check } from 'lucide-react';
import { format } from 'date-fns';

interface Comment {
  id: string;
  screenshot_id: string;
  user_id: string;
  comment: string;
  created_at: string;
  updated_at: string;
  user_name?: string;
}

interface ScreenshotCommentsProps {
  screenshotId: string;
}

// Use any-typed client for screenshot_comments table (not yet in generated types)
const db = supabase as any;

export const ScreenshotComments: React.FC<ScreenshotCommentsProps> = ({ screenshotId }) => {
  const { userDetails } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchComments = useCallback(async () => {
    try {
      const { data, error } = await db
        .from('screenshot_comments')
        .select('*')
        .eq('screenshot_id', screenshotId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch user names for comments
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map((c: any) => c.user_id))];
        const { data: users } = await supabase
          .from('users')
          .select('id, full_name')
          .in('id', userIds as string[]);

        const userMap = new Map((users || []).map(u => [u.id, u.full_name || 'Unknown']));
        const enriched: Comment[] = data.map((c: any) => ({
          ...c,
          user_name: userMap.get(c.user_id) || 'Unknown',
        }));
        setComments(enriched);
      } else {
        setComments([]);
      }
    } catch (err) {
      console.error('Error fetching comments:', err);
    } finally {
      setLoading(false);
    }
  }, [screenshotId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleAdd = async () => {
    if (!newComment.trim() || !userDetails?.id) return;
    setSubmitting(true);
    try {
      const { error } = await db
        .from('screenshot_comments')
        .insert({
          screenshot_id: screenshotId,
          user_id: userDetails.id,
          comment: newComment.trim(),
        });
      if (error) throw error;
      setNewComment('');
      await fetchComments();
    } catch (err) {
      console.error('Error adding comment:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editText.trim()) return;
    try {
      const { error } = await db
        .from('screenshot_comments')
        .update({ comment: editText.trim(), updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      setEditingId(null);
      setEditText('');
      await fetchComments();
    } catch (err) {
      console.error('Error updating comment:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await db
        .from('screenshot_comments')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await fetchComments();
    } catch (err) {
      console.error('Error deleting comment:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="mt-4 border-t pt-4">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="h-4 w-4 text-gray-500" />
        <h4 className="text-sm font-semibold text-gray-700">
          Comments {comments.length > 0 && `(${comments.length})`}
        </h4>
      </div>

      {loading ? (
        <p className="text-xs text-gray-400">Loading comments...</p>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {comments.map(c => (
            <div key={c.id} className="bg-gray-50 rounded-lg p-2 text-sm">
              {editingId === c.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    className="text-sm min-h-[60px]"
                  />
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => handleUpdate(c.id)}>
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setEditingId(null)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-xs text-blue-600">{c.user_name}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">
                        {format(new Date(c.created_at), 'MMM d, HH:mm')}
                      </span>
                      {c.user_id === userDetails?.id && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 w-5 p-0"
                            onClick={() => { setEditingId(c.id); setEditText(c.comment); }}
                          >
                            <Pencil className="h-3 w-3 text-gray-400" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 w-5 p-0"
                            onClick={() => handleDelete(c.id)}
                          >
                            <Trash2 className="h-3 w-3 text-red-400" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="text-gray-700 whitespace-pre-wrap">{c.comment}</p>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add comment input */}
      <div className="flex gap-2 mt-3">
        <Textarea
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a comment..."
          className="text-sm min-h-[40px] flex-1 resize-none"
          rows={1}
        />
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={!newComment.trim() || submitting}
          className="h-10 px-3"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
