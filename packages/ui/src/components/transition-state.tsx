'use client'

import { motionTokens } from '@life-loop/design-tokens'
import type { TransitionState as TransitionStateValue } from '@life-loop/shared-types'
import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Badge } from './badge'
import { Card } from './card'
import { ProgressBar } from './progress-bar'

const stateTones: Record<
  TransitionStateValue,
  'neutral' | 'success' | 'warning' | 'danger' | 'info'
> = {
  idle: 'neutral',
  preparing: 'info',
  validating: 'info',
  'in-progress': 'info',
  'partial-success': 'warning',
  success: 'success',
  retrying: 'info',
  'recoverable-error': 'warning',
  'blocking-error': 'danger',
  'completed-with-warnings': 'warning',
  cancelled: 'neutral',
  'disconnected-dependency': 'warning',
  empty: 'neutral',
}

export interface TransitionStateProps {
  state: TransitionStateValue
  title: string
  description: string
  safeNow: string
  nextAction: string
  progress?: number
  details?: ReactNode
  className?: string
}

export function TransitionState({
  state,
  title,
  description,
  safeNow,
  nextAction,
  progress,
  details,
  className,
}: TransitionStateProps) {
  const reducedMotion = useReducedMotion()

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: motionTokens.distance.sm }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reducedMotion ? 0 : motionTokens.duration.normal,
        ease: motionTokens.easing.productiveEnter,
      }}
    >
      <Card className={cn('space-y-4', className)}>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            <p className="text-sm text-[hsl(var(--color-text-secondary))]">{description}</p>
          </div>
          <Badge tone={stateTones[state]}>{state}</Badge>
        </div>
        {typeof progress === 'number' ? (
          <ProgressBar state={state === 'blocking-error' ? 'blocked' : 'known'} value={progress} />
        ) : null}
        <dl className="grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-lg bg-muted p-3">
            <dt className="font-medium text-foreground">Safe right now</dt>
            <dd className="mt-1 text-[hsl(var(--color-text-secondary))]">{safeNow}</dd>
          </div>
          <div className="rounded-lg bg-muted p-3">
            <dt className="font-medium text-foreground">Next best action</dt>
            <dd className="mt-1 text-[hsl(var(--color-text-secondary))]">{nextAction}</dd>
          </div>
        </dl>
        {details ? (
          <div className="text-sm text-[hsl(var(--color-text-secondary))]">{details}</div>
        ) : null}
      </Card>
    </motion.div>
  )
}
