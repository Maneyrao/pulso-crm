import Link from 'next/link';
import { CheckCircle2, CircleHelp, Info, XCircle } from 'lucide-react';
import type { AccessCheckResponse } from '@pulso/contracts/access';
import { Button } from '@pulso/ui';
import { usePermission } from '@/lib/auth/permissions';
import { ACCESS_REASON_CONFIG } from './reason-config';

const TONE_CLASS: Record<string, string> = {
  success: 'border-(--color-access-allowed) bg-(--color-access-allowed-subtle) text-(--color-access-allowed-subtle-foreground)',
  info: 'border-(--color-info) bg-(--color-info-subtle) text-(--color-info-subtle-foreground)',
  warning: 'border-(--color-warning) bg-(--color-warning-subtle) text-(--color-warning-subtle-foreground)',
  danger: 'border-(--color-access-denied) bg-(--color-access-denied-subtle) text-(--color-access-denied-subtle-foreground)',
  neutral: 'border-(--color-border-strong) bg-(--color-muted-subtle) text-(--color-muted-subtle-foreground)',
};

const TONE_ICON: Record<string, typeof CheckCircle2> = {
  success: CheckCircle2,
  info: Info,
  warning: Info,
  danger: XCircle,
  neutral: CircleHelp,
};

export interface AccessResultCardProps {
  result: AccessCheckResponse;
}

/**
 * Banner grande del resultado de `/access/check`. Texto + ícono + color
 * siempre juntos (FRONTEND_PLAN §6.3, §8): nunca se distingue el estado sólo
 * por el color de fondo.
 */
export function AccessResultCard({ result }: AccessResultCardProps) {
  const config = ACCESS_REASON_CONFIG[result.reasonCode];
  const Icon = TONE_ICON[config.tone] ?? CircleHelp;
  const canCollect = usePermission('payment:collect');
  const canSell = usePermission('membership:write');
  const canCreateMember = usePermission('member:write');

  const fullName = result.member ? `${result.member.firstName} ${result.member.lastName}` : null;

  return (
    <section
      aria-live="assertive"
      role="status"
      data-reason-code={result.reasonCode}
      className={`flex flex-col gap-4 rounded-(--radius-lg) border-2 p-6 ${TONE_CLASS[config.tone]}`}
    >
      <div className="flex items-start gap-4">
        <Icon aria-hidden={true} className="h-10 w-10 shrink-0" />
        <div className="flex flex-1 flex-col gap-1">
          <p className="text-(--text-xl) font-semibold">{config.title}</p>
          <p className="text-(--text-base)">{config.description}</p>
        </div>
      </div>

      {result.member ? (
        <div className="flex items-center gap-4 rounded-(--radius-md) bg-(--color-surface) p-4">
          {result.member.photoUrl ? (
            // Foto de socio: imagen simple, sin optimización de next/image
            // (URL prefirmada de corta vida — no vale la pena cachear).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={result.member.photoUrl}
              alt=""
              className="h-16 w-16 shrink-0 rounded-(--radius-full) object-cover"
            />
          ) : null}
          <div>
            <p className="text-(--text-access-result) font-semibold text-(--color-text)">{fullName}</p>
            {result.membership ? (
              <p className="text-(--text-sm) text-(--color-muted)">
                {result.membership.planName}
                {result.membership.endDate ? ` · vence ${result.membership.endDate}` : ''}
                {result.membership.classesRemaining !== null
                  ? ` · ${result.membership.classesRemaining} clases restantes`
                  : ''}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {config.action ? (
        <div>
          {config.action === 'COLLECT_FEE' && canCollect && result.member ? (
            <Button asChild variant="outline">
              <Link href={`/members/${result.member.id}?tab=cuenta`}>Cobrar cuota</Link>
            </Button>
          ) : null}
          {config.action === 'SELL_PACK' && canSell && result.member ? (
            <Button asChild variant="outline">
              <Link href={`/members/${result.member.id}?tab=membresias`}>Vender pack</Link>
            </Button>
          ) : null}
          {config.action === 'COLLECT_DEBT' && canCollect && result.member ? (
            <Button asChild variant="danger">
              <Link href={`/members/${result.member.id}?tab=cuenta`}>Cobrar deuda</Link>
            </Button>
          ) : null}
          {config.action === 'CREATE_MEMBER' && canCreateMember ? (
            <Button asChild variant="outline">
              <Link href="/members/new">Crear socio</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
