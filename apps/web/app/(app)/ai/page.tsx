'use client';

import * as React from 'react';
import { Bot, Send } from 'lucide-react';
import { Alert, Button, Card, CardContent, Input } from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { getInsightsDemoDataset } from '@/lib/mock/data/insights-demo';

const DATASET = getInsightsDemoDataset();

const FALLBACK_ANSWER =
  'En la demo puedo responder las preguntas sugeridas. El asistente completo llega con el backend de reportes.';

const RESPONSE_DELAY_MS = 600;

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

function findAnswer(text: string): string {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return FALLBACK_ANSWER;

  const match = DATASET.suggestedQuestions.find((question) =>
    question.keywords.some((keyword) => normalized.includes(keyword)),
  );
  return match?.answer ?? FALLBACK_ANSWER;
}

export default function AiPage() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hola, soy el asistente de Pulso. Elegí una pregunta sugerida o escribí la tuya.',
    },
  ]);
  const [draft, setDraft] = React.useState('');
  const [isThinking, setIsThinking] = React.useState(false);
  const nextId = React.useRef(1);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const sendMessage = (text: string): void => {
    const trimmed = text.trim();
    if (!trimmed || isThinking) return;

    const userId = `msg-${nextId.current++}`;
    setMessages((current) => [...current, { id: userId, role: 'user', content: trimmed }]);
    setDraft('');
    setIsThinking(true);

    const answer = findAnswer(trimmed);
    window.setTimeout(() => {
      const assistantId = `msg-${nextId.current++}`;
      setMessages((current) => [...current, { id: assistantId, role: 'assistant', content: answer }]);
      setIsThinking(false);
    }, RESPONSE_DELAY_MS);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    sendMessage(draft);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Asistente"
        description="Consultá los datos de tu gimnasio en lenguaje natural."
        icon={Bot}
        mock
      />

      <Alert tone="info" title="Demo sin IA real">
        Las respuestas de este asistente son de ejemplo, generadas con los datos de esta demo. El asistente
        conectado a un modelo real llega con el backend de reportes.
      </Alert>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div
            role="log"
            aria-live="polite"
            aria-label="Historial de la conversación"
            className="flex max-h-[26rem] min-h-[16rem] flex-col gap-3 overflow-y-auto"
          >
            {messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}
            {isThinking ? (
              <div className="flex items-center gap-2 self-start rounded-(--radius-lg) bg-(--color-muted-subtle) px-3 py-2 text-(--text-sm) text-(--color-muted)">
                <Bot className="h-4 w-4 shrink-0" aria-hidden={true} />
                Escribiendo…
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          <div className="flex flex-wrap gap-2">
            {DATASET.suggestedQuestions.map((question) => (
              <button
                key={question.id}
                type="button"
                onClick={() => sendMessage(question.question)}
                disabled={isThinking}
                className="rounded-(--radius-full) border border-(--color-border-strong) bg-(--color-surface) px-3 py-1.5 text-(--text-sm) text-(--color-text) hover:bg-(--color-muted-subtle) disabled:cursor-not-allowed disabled:opacity-50"
              >
                {question.question}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <label htmlFor="ai-chat-input" className="sr-only">
              Escribí tu pregunta
            </label>
            <Input
              id="ai-chat-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Escribí tu pregunta sobre el gimnasio…"
              disabled={isThinking}
            />
            <Button type="submit" disabled={isThinking || !draft.trim()} aria-label="Enviar mensaje">
              <Send className="h-4 w-4" aria-hidden={true} />
              Enviar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`flex max-w-[85%] items-start gap-2 rounded-(--radius-lg) px-3 py-2 text-(--text-sm) ${
          isUser
            ? 'bg-(--color-primary-subtle) text-(--color-primary-subtle-foreground)'
            : 'bg-(--color-muted-subtle) text-(--color-muted-subtle-foreground)'
        }`}
      >
        {isUser ? null : <Bot className="mt-0.5 h-4 w-4 shrink-0" aria-hidden={true} />}
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}
