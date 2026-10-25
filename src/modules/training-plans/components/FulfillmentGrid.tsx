import { useState } from "react";
import {
  PixelRatio,
  Pressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";

import { t } from "../../../core/i18n";
import { useTheme } from "../../../core/theme";
import { Icon, Tag } from "../../../core/ui";
import "../i18n";
import type { BlockStatus, PlanBlock } from "../types";
import { blockSummary } from "./blockSummary";
import { nextStatus, statusLabel, statusTag } from "./blockStatus";
import type { FulfillmentCell, FulfillmentContent } from "./fulfillment";
import { cellKey } from "./fulfillment";

export type FulfillmentGridProps = FulfillmentContent & {
  onCycle: (athleteId: string, blockId: string, next: BlockStatus) => void;
  // Opens the series timing for a block that records times; without it the block headers are plain text.
  onOpenTiming?: (blockId: string) => void;
};

const NOT_MARKED: FulfillmentCell = { status: "not_marked" };
// Widths in caption-sized units, so they follow the gallery scale and the system font scale: the longest word of a cell never breaks.
const NAME_UNITS = 10;
const COLUMN_UNITS = 14;

type Heights = { scale: number; left: number[]; right: number[] };

function timesText(block: PlanBlock, cell: FulfillmentCell): string | null {
  if (block.recording === "completion") return null;
  if (cell.status !== "done" && cell.status !== "partial") return null;
  if (typeof cell.timesRecorded !== "number") return null;
  // One time per repetition, or a single total for the series.
  return t("training_plans.fulfillment.times", {
    done: cell.timesRecorded,
    count: block.recording === "per_repetition" ? block.repetitions : 1,
  });
}

function changeText(cell: FulfillmentCell): string | null {
  if (!cell.change) return null;
  const { kind, author, dateLabel } = cell.change;
  return t(
    `training_plans.fulfillment.${kind === "marked" ? "marked_by" : "corrected_by"}`,
    // Non-breaking spaces keep the date from wrapping between day and month.
    { name: author, date: dateLabel.replace(/ /g, "\u00A0") },
  );
}

const hiddenFromReaders = {
  importantForAccessibility: "no-hide-descendants",
  accessibilityElementsHidden: true,
} as const;

// Presentational: rows are athletes, columns are blocks, a tap on a cell asks for the next status of the cycle.
export function FulfillmentGrid({
  athletes,
  blocks,
  vocabulary,
  cells,
  onCycle,
  onOpenTiming,
}: FulfillmentGridProps) {
  const { colors, space, radius, typography } = useTheme();
  const unit = typography.caption.fontSize * PixelRatio.getFontScale();
  const nameWidth = Math.round(unit * NAME_UNITS);
  const columnWidth = Math.round(unit * COLUMN_UNITS);

  // Row 0 is the header. Both sides of a row take the taller height; a font scale change starts the measuring over.
  const [measured, setMeasured] = useState<Heights>({
    scale: unit,
    left: [],
    right: [],
  });
  const heights =
    measured.scale === unit ? measured : { scale: unit, left: [], right: [] };
  const measure =
    (side: "left" | "right", row: number) => (event: LayoutChangeEvent) => {
      const height = event.nativeEvent.layout.height;
      setMeasured((current) => {
        const base =
          current.scale === unit
            ? current
            : { scale: unit, left: [], right: [] };
        if (base[side][row] === height) return base;
        const next = [...base[side]];
        next[row] = height;
        return { ...base, [side]: next };
      });
    };
  const minHeight = (row: number) =>
    Math.max(heights.left[row] ?? 0, heights.right[row] ?? 0);

  // The synced minHeight goes on the outer row; onLayout goes on an inner node that never receives it, so it reads the natural height and a row can shrink again.
  const content = (name: "left" | "right", row: number) => ({
    testID: `fulfillment-${name}-content-${row}`,
    onLayout: measure(name, row),
  });

  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
      <View style={{ width: nameWidth, gap: space[2] }}>
        <View
          testID="fulfillment-left-row-0"
          style={{ minHeight: minHeight(0) }}
        >
          <View {...content("left", 0)} />
        </View>
        {athletes.map((athlete, index) => (
          <View
            key={athlete.id}
            testID={`fulfillment-left-row-${index + 1}`}
            style={{
              minHeight: minHeight(index + 1),
              justifyContent: "center",
              paddingRight: space[2],
            }}
          >
            <View {...content("left", index + 1)}>
              <Text style={[typography["body-strong"], { color: colors.ink }]}>
                {athlete.shortName}
              </Text>
              {athlete.skipped && (
                <Text
                  style={[typography.caption, { color: colors["ink-muted"] }]}
                >
                  {t("training_plans.fulfillment.skipped")}
                </Text>
              )}
            </View>
          </View>
        ))}
      </View>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator
        style={{ flex: 1 }}
      >
        <View style={{ gap: space[2] }}>
          <View
            testID="fulfillment-right-row-0"
            style={{ minHeight: minHeight(0) }}
          >
            <View
              {...content("right", 0)}
              style={{ flexDirection: "row", alignSelf: "flex-start" }}
            >
              {blocks.map((block) => {
                const header = (
                  <View
                    style={{
                      width: columnWidth,
                      gap: space[1],
                      paddingHorizontal: space[1],
                    }}
                  >
                    <Text
                      style={[typography.caption, { color: colors["ink-muted"] }]}
                    >
                      {t(`training_plans.phase.${block.phase}`)}
                    </Text>
                    <Text
                      style={[typography["body-strong"], { color: colors.ink }]}
                    >
                      {blockSummary(block, vocabulary)}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: space[1] }}>
                      {onOpenTiming && block.recording !== "completion" && <Icon name="timer" size="icon-sm" />}
                      <Text
                        style={[typography.caption, { color: colors["ink-muted"] }]}
                      >
                        {t(`training_plans.recording_short.${block.recording}`)}
                      </Text>
                    </View>
                  </View>
                );
                return onOpenTiming && block.recording !== "completion" ? (
                  <Pressable
                    key={block.id}
                    accessibilityRole="button"
                    accessibilityLabel={t("training_plans.fulfillment.open_timing", {
                      summary: blockSummary(block, vocabulary),
                    })}
                    onPress={() => onOpenTiming(block.id)}
                  >
                    {header}
                  </Pressable>
                ) : (
                  <View key={block.id}>{header}</View>
                );
              })}
            </View>
          </View>
          {athletes.map((athlete, row) => (
            <View
              key={athlete.id}
              testID={`fulfillment-right-row-${row + 1}`}
              style={{ minHeight: minHeight(row + 1) }}
            >
              <View
                {...content("right", row + 1)}
                style={{ flexDirection: "row", alignSelf: "flex-start" }}
              >
                {blocks.map((block, column) => {
                  const cell =
                    cells[cellKey(athlete.id, block.id)] ?? NOT_MARKED;
                  const tag = statusTag({
                    ...cell,
                    repetitions: block.repetitions,
                  });
                  const times = timesText(block, cell);
                  const change = changeText(cell);
                  const next = nextStatus(cell.status);
                  const label =
                    t("training_plans.fulfillment.cell_label", {
                      athlete: athlete.shortName,
                      position: t("training_plans.builder.block_position", {
                        position: column + 1,
                      }),
                      summary: blockSummary(block, vocabulary),
                      status: tag.label,
                    }) +
                    [times, change]
                      .filter((text): text is string => text !== null)
                      .map((text) =>
                        t("training_plans.fulfillment.cell_extra", { text }),
                      )
                      .join("");
                  return (
                    // The width goes on the wrapper, never on the control.
                    <View
                      key={block.id}
                      style={{
                        width: columnWidth,
                        paddingHorizontal: space[1],
                        justifyContent: "center",
                      }}
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={label}
                        accessibilityHint={t(
                          "training_plans.fulfillment.cell_hint",
                          {
                            next: statusLabel({
                              status: next,
                              repetitions: block.repetitions,
                            }),
                          },
                        )}
                        disabled={athlete.skipped}
                        accessibilityState={{ disabled: athlete.skipped === true }}
                        onPress={() => onCycle(athlete.id, block.id, next)}
                        style={{
                          flexGrow: 1,
                          minHeight: 48,
                          padding: space[2],
                          gap: space[1],
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: radius.sm,
                          backgroundColor: colors["surface-1"],
                        }}
                      >
                        <View {...hiddenFromReaders} style={{ gap: space[1] }}>
                          <Tag {...tag} />
                          {times && (
                            <Text
                              style={[
                                typography.caption,
                                { color: colors.ink },
                              ]}
                            >
                              {times}
                            </Text>
                          )}
                          {change && (
                            <Text
                              style={[
                                typography.caption,
                                { color: colors["ink-muted"] },
                              ]}
                            >
                              {change}
                            </Text>
                          )}
                        </View>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
