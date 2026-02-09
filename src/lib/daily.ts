export type DailySessionType = 'group' | 'oneToOne'

const DAILY_ROOM_URLS: Record<DailySessionType, string> = {
  group: (import.meta.env.VITE_DAILY_GROUP_ROOM_URL ?? '').trim(),
  oneToOne: (import.meta.env.VITE_DAILY_ONE_TO_ONE_ROOM_URL ?? '').trim(),
}

export const getDailyRoomUrl = (type: DailySessionType) => DAILY_ROOM_URLS[type]

export const hasDailyRoomUrl = (type: DailySessionType) => DAILY_ROOM_URLS[type].length > 0

export const getDailyMissingConfigMessage = (type: DailySessionType) => {
  if (type === 'group') {
    return 'Bitte VITE_DAILY_GROUP_ROOM_URL in .env.local setzen.'
  }
  return 'Bitte VITE_DAILY_ONE_TO_ONE_ROOM_URL in .env.local setzen.'
}
