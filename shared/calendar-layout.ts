import { calendarDays, type WorkInterval } from "./work-calendar";

export const HOUR_HEIGHT = 64;
const HOUR = 3600000;
export function durationText(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
}

export interface CalendarBlock { interval: WorkInterval; start: number; end: number; top: number; height: number; lane: number; lanes: number; }
export function calendarLayout(intervals: readonly WorkInterval[], from: number, to: number, snapshotAt: number, fullDay = false) {
  const days = calendarDays([], from, to, snapshotAt).map((day) => {
    const blocks: CalendarBlock[] = intervals.flatMap((interval) => {
      const endAt = Math.min(interval.endAt ?? snapshotAt, snapshotAt);
      if (interval.startAt >= day.to || endAt < day.from || interval.startAt > snapshotAt || (endAt === day.from && interval.startAt < day.from)) return [];
      const start = Math.max(day.from, interval.startAt), end = Math.max(start, Math.min(day.to, endAt));
      if (start >= day.to) return [];
      const height = Math.max(28, (end - start) / HOUR * HOUR_HEIGHT);
      const top = Math.min((start - day.from) / HOUR * HOUR_HEIGHT, (day.to - day.from) / HOUR * HOUR_HEIGHT - height);
      return [{ interval, start, end, top, height, lane: 0, lanes: 1 }];
    }).sort((a, b) => a.start - b.start || a.end - b.end || a.interval.id.localeCompare(b.interval.id));
    let cluster: CalendarBlock[] = [], clusterEnd = -Infinity, ends: number[] = [];
    const finish = () => { for (const block of cluster) block.lanes = ends.length; };
    for (const block of blocks) {
      if (block.top >= clusterEnd) { finish(); cluster = []; ends = []; }
      let lane = ends.findIndex((end) => end <= block.top);
      if (lane < 0) lane = ends.length;
      block.lane = lane; ends[lane] = block.top + block.height;
      clusterEnd = Math.max(clusterEnd, ends[lane]!); cluster.push(block);
    }
    finish();
    return { ...day, blocks, hours: (day.to - day.from) / HOUR };
  });
  const blocks = days.flatMap((day) => day.blocks);
  const maxHours = Math.max(24, ...days.map((day) => day.hours));
  let startHour = fullDay ? 0 : blocks.length ? Math.max(0, Math.floor(blocks.reduce((first, block) => Math.min(first, block.top), Infinity) / HOUR_HEIGHT) - 1) : 8;
  let endHour = fullDay ? maxHours : blocks.length ? Math.min(maxHours, Math.ceil(blocks.reduce((last, block) => Math.max(last, block.top + block.height), 0) / HOUR_HEIGHT) + 1) : 18;
  if (endHour - startHour < 6) { startHour = Math.max(0, Math.min(startHour, maxHours - 6)); endHour = Math.min(maxHours, Math.max(endHour, startHour + 6)); }
  return { days, startHour, endHour, height: (endHour - startHour) * HOUR_HEIGHT };
}
