import { useState, useRef, useEffect } from 'react';
import { Send, User, Bot } from 'lucide-react';
import type { TicketComment } from '@/user/types/ticket';
import { useTicketDetailStore } from '@/user/store/ticketStore';
import { postComment } from '@/user/api/tickets';
import { formatTime, formatRelativeTime, cn } from '@/lib/utils';
import { Button } from './ui/button';

interface Props {
  ticketId: string;
}

export function CommentThread({ ticketId }: Props) {
  const comments = useTicketDetailStore((s) => s.comments);
  const addComment = useTicketDetailStore((s) => s.addComment);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new comment arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  async function handleSend() {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setText('');
    try {
      const comment = await postComment(ticketId, content);
      addComment(comment);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      void handleSend();
    }
  }

  return (
    <section id="comments" className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">Comments</h2>
        <span className="text-xs text-gray-400">{comments.length} messages</span>
      </div>

      {/* Thread */}
      <div className="px-4 py-3 space-y-4 max-h-96 overflow-y-auto">
        {comments.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">No comments yet.</p>
        )}
        {comments.map((c) => (
          <CommentBubble key={c.id} comment={c} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="px-4 py-3 border-t border-gray-100">
        <div className="flex gap-2 items-end">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a comment… (⌘↵ to send)"
            rows={2}
            className={cn(
              'flex-1 resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm',
              'placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500',
            )}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleSend()}
            disabled={!text.trim() || sending}
            className="self-end"
          >
            <Send size={13} />
            Send
          </Button>
        </div>
      </div>
    </section>
  );
}

function CommentBubble({ comment }: { comment: TicketComment }) {
  const isAgent = comment.author_type === 'agent';

  return (
    <div className={cn('flex gap-2.5', isAgent && 'opacity-90')}>
      {/* Avatar */}
      <div
        className={cn(
          'shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold mt-0.5',
          isAgent ? 'bg-indigo-500' : 'bg-gray-500',
        )}
      >
        {isAgent ? <Bot size={13} /> : <User size={13} />}
      </div>

      {/* Bubble */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-xs font-semibold text-gray-800">{comment.author}</span>
          {comment.role && (
            <span className="text-[10px] text-gray-400 capitalize">[{comment.role}]</span>
          )}
          {isAgent && (
            <span className="text-[10px] bg-indigo-100 text-indigo-600 rounded-full px-1.5">Auto</span>
          )}
          <span
            className="ml-auto text-[10px] text-gray-400 font-mono"
            title={comment.created_at}
          >
            {formatTime(comment.created_at)}
          </span>
        </div>
        <div
          className={cn(
            'rounded-lg px-3 py-2 text-sm text-gray-700 leading-relaxed',
            isAgent ? 'bg-indigo-50 border border-indigo-100' : 'bg-gray-50 border border-gray-100',
          )}
        >
          {comment.content}
        </div>
      </div>
    </div>
  );
}
