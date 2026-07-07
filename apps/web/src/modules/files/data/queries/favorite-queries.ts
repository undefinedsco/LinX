import {
  favoriteHooks,
  useFavoriteList,
} from '@/modules/favorites/collections'

export function useFilesFavoriteList(...args: Parameters<typeof useFavoriteList>) {
  return useFavoriteList(...args)
}

export const filesFavoriteHooks = favoriteHooks
