import { useMemo, useState, type ReactNode } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect } from 'react-native-svg';

import { t } from '../../../../core/i18n';
import { space, typography as baseTypography, useTheme } from '../../../../core/theme';
import { formatTime } from '../../../../core/time';
import { Segmented, StateView } from '../../../../core/ui';
import '../../i18n';
import { personalBestKinds } from '../../personalBest';
import { formatDate } from '../formatDate';
import type { HistoryResult } from '../HistoryList';
import { distanceLabel, strokeLabel } from '../sportLabel';
import { dateScale, filterByRange, timeScale, xFor, yFor, type RangeKey } from './scales';

export type ProgressChartProps = {
  // The results of ONE event (stroke, distance and pool), in any order. Those without a time, or of a kind that
  // cannot be compared with the event (a series total, a split), are not drawn.
  results: readonly HistoryResult[];
  // ISO date the ranges count back from; defaults to today on the device.
  today?: string;
};

const ranges: RangeKey[] = ['3m', '6m', '1y', 'all'];

// Marks of the design system's data visualization rules: the series is 3.5 thick, a training dot has a 2.5 ring,
// the personal best line is 1.5 thick and dashed 4 on, 4 off, the grid is 1 thick, and the personal best dot is the largest.
const seriesWidth = 3.5;
const trainingStroke = 2.5;
const bestStroke = 1.5;
const bestDash = '4 4';
const gridStroke = 1;
const dotRadius = { competition: 4.5, training: 4, best: 6.5 } as const;
// Layout, from the theme spacing: the plot is 4 steps of `space[8]` high, with room inside for the first and last tick.
const plotTop = space[3];
const plotHeight = space[8] * 4;
const plotBottom = plotTop + plotHeight;
const plotInset = space[2];
const sideInset = space[2];
const reservedRadius = space[1];
// The reserved projection zone at the end of the time axis; it grows with the text so its words keep fitting.
const reservedBase = space[12] + space[8];
const reservedMaxShare = 0.4;
// Advance of one character of the mono face, as a share of its font size, to leave room for the tick labels.
const monoAdvance = 0.6;
// Width used until the chart is measured; the measured width replaces it on the first layout.
const fallbackWidth = 320;
// Caption is the base of every label; the scale of the theme is its size over the unscaled one.
const baseCaptionSize = baseTypography.caption.fontSize;

const hidden = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const monthOf = (iso: string) => Number(iso.slice(5, 7));
const monthShort = (iso: string) => t(`athletes.date.month_short.${monthOf(iso)}`);
const monthLong = (iso: string) => t(`athletes.date.month_long.${monthOf(iso)}`);

const originText = (result: HistoryResult): string => {
  switch (result.origin) {
    case 'own':
      return t('athletes.progress_chart.tooltip.origin_own');
    case 'import':
      return result.sourceName || t('athletes.history.origin.import');
    case 'external_timer':
      return t('athletes.history.origin.external_timer');
    case 'other_school':
      return result.sourceName
        ? t('athletes.history.origin.other_school_named', { source: result.sourceName })
        : t('athletes.history.origin.other_school');
  }
};

type Plotted = HistoryResult & { time: number };

const isPlotted = (result: HistoryResult): result is Plotted =>
  result.time !== null && (personalBestKinds as readonly string[]).includes(result.value.kind);

const byDate = (a: Plotted, b: Plotted) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Presentational: results in, picture out. No data access; the projection zone is reserved and stays empty.
export function ProgressChart({ results, today }: ProgressChartProps) {
  const { colors, radius, size, typography } = useTheme();
  const textScale = typography.caption.fontSize / baseCaptionSize;
  const [range, setRange] = useState<RangeKey>('all');
  const [selectedId, setSelectedId] = useState<string>();
  const [measured, setMeasured] = useState<number>();
  const width = measured ?? fallbackWidth;

  const plotted = useMemo(() => results.filter(isPlotted).sort(byDate), [results]);
  const reference = today ?? todayIso();
  const visible = useMemo(() => filterByRange(plotted, range, reference), [plotted, range, reference]);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0 && next !== measured) setMeasured(next);
  };

  const titleColor = colors.ink;
  const mutedColor = colors['ink-muted'];
  const frame = { backgroundColor: colors['surface-1'], borderRadius: radius.md, padding: space[4], gap: space[3] } as const;

  const header = (
    <View style={{ gap: space[1] }}>
      <Text accessibilityRole="header" style={[typography.subtitle, { color: titleColor }]}>
        {t('athletes.progress_chart.title')}
      </Text>
      <Text style={[typography.caption, { color: mutedColor }]}>{t('athletes.progress_chart.subtitle')}</Text>
    </View>
  );

  // Nothing to draw at all: the empty state, with no axis to pick a range for.
  if (plotted.length === 0) {
    return (
      <View style={frame}>
        {header}
        <StateView
          kind="empty"
          title={t('athletes.progress_chart.empty.title')}
          message={t('athletes.progress_chart.empty.message')}
        />
      </View>
    );
  }

  const picker = (
    <Segmented
      accessibilityLabel={t('athletes.progress_chart.range.label')}
      value={range}
      onChange={(next) => {
        setRange(next);
        setSelectedId(undefined);
      }}
      options={ranges.map((value) => ({ value, label: t(`athletes.progress_chart.range.${value}`) }))}
    />
  );

  if (visible.length === 0) {
    return (
      <View style={frame}>
        {header}
        {picker}
        <StateView
          kind="empty"
          title={t('athletes.progress_chart.empty.title')}
          message={t('athletes.progress_chart.empty.range_message')}
        />
      </View>
    );
  }

  const scale = timeScale(visible.map((r) => r.time));
  const tickLabels = scale.ticks.map((tick) => formatTime(tick));
  const leftPad = Math.ceil(Math.max(...tickLabels.map((label) => label.length)) * monoAdvance * typography.caption.fontSize) + space[3];
  const band = Math.min(Math.round(reservedBase * textScale), width * reservedMaxShare);
  const bandLeft = width - band;
  const dataLeft = leftPad + sideInset;
  const dataWidth = Math.max(1, bandLeft - space[2] - sideInset - dataLeft);
  const gridRight = bandLeft - space[2];
  const top = plotTop + plotInset;
  const height = plotBottom - plotTop - 2 * plotInset;

  const dates = dateScale(visible.map((r) => r.date));
  const px = (r: Plotted) => xFor(r.date, dates, dataLeft, dataWidth);
  const py = (r: Plotted) => yFor(r.time, scale, top, height);

  const best = visible.find((r) => r.isPersonalBest);
  const first = visible[0]!;
  const last = visible[visible.length - 1]!;
  const summary =
    visible.length === 1
      ? t('athletes.progress_chart.summary_single', { time: formatTime(first.time), month: monthLong(first.date) })
      : t('athletes.progress_chart.summary', {
          from: formatTime(first.time),
          fromMonth: monthLong(first.date),
          to: formatTime(last.time),
          toMonth: monthLong(last.date),
        });
  const label = t('athletes.progress_chart.label', {
    event: `${strokeLabel(first.stroke)} ${distanceLabel(first.distance)}`,
    summary,
  });

  const selected = visible.find((r) => r.id === selectedId);
  // Labels use the caption size of the theme (so they scale with the text). Axis numbers take the mono face of `time-sm`,
  // the personal best label and the projection text the strong sans face.
  const labelLine = typography.caption.lineHeight;
  const axisFont = { ...typography.caption, fontFamily: typography['time-sm'].fontFamily };
  const sansFont = {
    ...typography.caption,
    fontFamily: typography['body-strong'].fontFamily,
    fontWeight: typography['body-strong'].fontWeight,
  };
  const bestY = best ? py(best) : 0;
  // The label sits above the line unless the line is too close to the top.
  const bestLabelTop = bestY - labelLine < 0 ? bestY + space[1] : bestY - labelLine;
  const hitRadius = size['target-min'] / 2;
  // The axis labels under the plot take one line of the scaled caption.
  const chartHeight = plotBottom + space[1] + labelLine + space[1];
  const dotDiameter = dotRadius.competition * 2;

  return (
    <View style={frame}>
      {header}
      {picker}
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        onLayout={onLayout}
        style={{ height: chartHeight, alignSelf: 'stretch' }}
      >
        <View {...hidden} style={{ height: chartHeight }}>
          <Svg width={width} height={chartHeight}>
            {scale.ticks.map((tick, index) => (
              <Line
                key={tick}
                testID={`chart-grid-${index}`}
                x1={leftPad}
                x2={gridRight}
                y1={yFor(tick, scale, top, height)}
                y2={yFor(tick, scale, top, height)}
                stroke={colors['viz-grid']}
                strokeWidth={gridStroke}
              />
            ))}
            <Rect
              testID="chart-reserved"
              x={bandLeft}
              y={plotTop}
              width={band}
              height={plotBottom - plotTop}
              rx={reservedRadius}
              fill={colors['viz-reserved']}
            />
            {best && (
              <Line
                testID="chart-best-line"
                x1={leftPad}
                x2={gridRight}
                y1={bestY}
                y2={bestY}
                stroke={colors['viz-best']}
                strokeWidth={bestStroke}
                strokeDasharray={bestDash}
              />
            )}
            {/* One or two results are points only: a line between so few says nothing yet. */}
            {visible.length >= 3 && (
              <Polyline
                testID="chart-series"
                points={visible.map((r) => `${px(r)},${py(r)}`).join(' ')}
                fill="none"
                stroke={colors['viz-series-1']}
                strokeWidth={seriesWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {visible.map((r) =>
              r.isPersonalBest ? null : r.context === 'competition' ? (
                <Circle
                  key={r.id}
                  testID={`chart-marker-${r.id}`}
                  cx={px(r)}
                  cy={py(r)}
                  r={dotRadius.competition}
                  fill={colors['viz-series-1']}
                />
              ) : (
                <Circle
                  key={r.id}
                  testID={`chart-marker-${r.id}`}
                  cx={px(r)}
                  cy={py(r)}
                  r={dotRadius.training}
                  fill={colors['surface-1']}
                  stroke={colors['viz-series-1']}
                  strokeWidth={trainingStroke}
                />
              ),
            )}
            {best && (
              <Circle
                testID={`chart-marker-${best.id}`}
                cx={px(best)}
                cy={bestY}
                r={dotRadius.best}
                fill={colors['viz-best']}
              />
            )}
            {/* Touch targets over the dots: a dot alone is too small to hit. */}
            {visible.map((r) => (
              <Circle
                key={r.id}
                testID={`chart-point-${r.id}`}
                cx={px(r)}
                cy={py(r)}
                r={hitRadius}
                fill="transparent"
                onPress={() => setSelectedId((current) => (current === r.id ? undefined : r.id))}
              />
            ))}
          </Svg>

          {scale.ticks.map((tick, index) => (
            <Text
              key={tick}
              style={[
                axisFont,
                {
                  position: 'absolute',
                  left: 0,
                  width: leftPad - space[2],
                  top: yFor(tick, scale, top, height) - labelLine / 2,
                  textAlign: 'right',
                  color: colors['viz-axis'],
                },
              ]}
            >
              {tickLabels[index]}
            </Text>
          ))}
          {[first, ...(visible.length > 1 ? [last] : [])].map((r, index) => (
            <Text
              key={index === 0 ? 'first' : 'last'}
              style={[
                axisFont,
                {
                  position: 'absolute',
                  left: px(r) - space[12] / 2,
                  width: space[12],
                  top: plotBottom + space[1],
                  textAlign: 'center',
                  color: colors['viz-axis'],
                },
              ]}
            >
              {monthShort(r.date)}
            </Text>
          ))}
          {best && (
            <Text
              style={[
                sansFont,
                {
                  position: 'absolute',
                  left: leftPad,
                  width: gridRight - leftPad,
                  top: bestLabelTop,
                  textAlign: 'right',
                  color: colors['viz-best'],
                },
              ]}
            >
              {t('athletes.progress_chart.personal_best', { time: formatTime(best.time) })}
            </Text>
          )}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: bandLeft,
              width: band,
              top: plotTop,
              height: plotBottom - plotTop,
              alignItems: 'center',
              justifyContent: 'center',
              padding: space[1],
            }}
          >
            <Text style={[sansFont, { textAlign: 'center', color: colors['viz-axis'] }]}>
              {t('athletes.progress_chart.projection')}
            </Text>
          </View>
        </View>
      </View>

      {visible.length < 3 && (
        <Text style={[typography.caption, { color: mutedColor }]}>{t('athletes.progress_chart.need_more')}</Text>
      )}

      {selected && (
        <View
          accessibilityLiveRegion="polite"
          style={{ gap: space[1], padding: space[3], borderRadius: radius.sm, backgroundColor: colors['surface-2'] }}
        >
          <Text style={[typography['time-sm'], { color: titleColor }]}>{formatTime(selected.time)}</Text>
          <Text style={[typography.caption, { color: mutedColor }]}>
            {t('athletes.progress_chart.tooltip.summary', {
              date: formatDate(selected.date, 'short') ?? '',
              kind: t(`athletes.history.context.${selected.context}`),
              origin: originText(selected),
            })}
          </Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[4] }}>
        <LegendItem
          mark={<View style={{ width: dotDiameter, height: dotDiameter, borderRadius: radius.full, backgroundColor: colors['viz-series-1'] }} />}
          text={t('athletes.history.context.competition')}
          color={mutedColor}
        />
        <LegendItem
          mark={
            <View
              style={{
                width: dotDiameter,
                height: dotDiameter,
                borderRadius: radius.full,
                borderWidth: trainingStroke,
                borderColor: colors['viz-series-1'],
                backgroundColor: colors['surface-1'],
              }}
            />
          }
          text={t('athletes.history.context.training')}
          color={mutedColor}
        />
        {best && (
          <LegendItem
            mark={<View style={{ width: size['icon-sm'], borderTopWidth: bestStroke, borderStyle: 'dashed', borderColor: colors['viz-best'] }} />}
            text={t('athletes.progress_chart.legend_personal_best')}
            color={mutedColor}
          />
        )}
      </View>
    </View>
  );
}

function LegendItem({ mark, text, color }: { mark: ReactNode; text: string; color: string }) {
  const { typography } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
      {mark}
      <Text style={[typography.caption, { color }]}>{text}</Text>
    </View>
  );
}
