import Image from 'next/image';
import { cn } from '@pulso/ui';

export function BrandLogo({
  size,
  priority = false,
  decorative = false,
  className,
}: {
  size: number;
  priority?: boolean;
  decorative?: boolean;
  className?: string;
}) {
  return (
    <Image
      src="/brand/el-templo-logo.webp"
      alt={decorative ? '' : 'Logo de El Templo'}
      width={size}
      height={size}
      priority={priority}
      className={cn('block shrink-0 object-cover', className)}
    />
  );
}
