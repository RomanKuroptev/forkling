/** Hours since midnight. Forklings sleep at night, and cats go wild at dusk. */
export const isNight = (hour: number) => hour >= 21 || hour < 6

export const isDusk = (hour: number) => hour >= 18 && hour < 21
