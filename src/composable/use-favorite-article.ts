import type { ComputedRef } from 'vue'
import { api } from 'src/services'
import type { Article } from 'src/services/api'
import useAsync from 'src/utils/use-async'

interface useFavoriteArticleProps {
  isFavorited: ComputedRef<boolean>
  articleSlug: ComputedRef<string>
  onUpdate: (newArticle: Article) => void
}

export function useFavoriteArticle({ isFavorited, articleSlug, onUpdate }: useFavoriteArticleProps) {
  // Favorited articles are unfavorited, and the other way round.
  const toggle = (slug: string) => isFavorited.value
    ? api.articles.deleteArticleFavorite(slug)
    : api.articles.createArticleFavorite(slug)

  const { active, run } = useAsync(async () => {
    const { data } = await toggle(articleSlug.value)
    onUpdate(data.article)
  })

  return {
    favoriteProcessGoing: active,
    favoriteArticle: run,
  }
}
