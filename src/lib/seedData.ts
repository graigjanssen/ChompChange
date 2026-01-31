import { supabase } from './supabase'

const FOOD_TIERS = [
  { name: 'Free',    min_amount: 0,  max_amount: 0,    default_value: 0,    sort_order: 0, color: '#363a42' },
  { name: 'Light',   min_amount: 1,  max_amount: 5,    default_value: 3,    sort_order: 1, color: '#2d5e28' },
  { name: 'Simple',  min_amount: 6,  max_amount: 10,   default_value: 8,    sort_order: 2, color: '#1a6455' },
  { name: 'Casual',  min_amount: 11, max_amount: 17,   default_value: 14,   sort_order: 3, color: '#1e5474' },
  { name: 'Takeout', min_amount: 18, max_amount: 26,   default_value: 22,   sort_order: 4, color: '#7a5510' },
  { name: 'Dining',  min_amount: 27, max_amount: 37,   default_value: 32,   sort_order: 5, color: '#7c3818' },
  { name: 'Upscale', min_amount: 38, max_amount: 50,   default_value: 44,   sort_order: 6, color: '#6e2228' },
  { name: 'Splurge', min_amount: 51, max_amount: 9999, default_value: 0, sort_order: 7, color: '#5e1638' },
]

const DRINK_TIERS = [
  { name: 'None',    min_amount: 0,  max_amount: 0,    default_value: 0,    sort_order: 0, color: '#363a42' },
  { name: 'Home',    min_amount: 1,  max_amount: 3,    default_value: 2,    sort_order: 1, color: '#2d5e28' },
  { name: 'Café',    min_amount: 4,  max_amount: 8,    default_value: 6,    sort_order: 2, color: '#1a6455' },
  { name: 'Single',  min_amount: 9,  max_amount: 15,   default_value: 12,   sort_order: 3, color: '#1e5474' },
  { name: 'Round',   min_amount: 16, max_amount: 24,   default_value: 20,   sort_order: 4, color: '#7a5510' },
  { name: 'Night',   min_amount: 25, max_amount: 37,   default_value: 31,   sort_order: 5, color: '#7c3818' },
  { name: 'Fancy',   min_amount: 38, max_amount: 50,   default_value: 44,   sort_order: 6, color: '#6e2228' },
  { name: 'Splurge', min_amount: 51, max_amount: 9999, default_value: 0, sort_order: 7, color: '#5e1638' },
]

export async function seedDefaultData(userId: string) {
  // Get or create categories
  let { data: cats } = await supabase
    .from('categories')
    .select('id, name')
    .eq('user_id', userId)

  if (!cats || cats.length === 0) {
    const { data: foodCat } = await supabase
      .from('categories')
      .insert({ user_id: userId, name: 'Food' })
      .select('id, name')
      .single()

    const { data: drinksCat } = await supabase
      .from('categories')
      .insert({ user_id: userId, name: 'Drinks' })
      .select('id, name')
      .single()

    if (!foodCat || !drinksCat) return
    cats = [foodCat, drinksCat]
  }

  // Check if tiers exist for each category, seed if missing
  const { count } = await supabase
    .from('tiers')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (count && count > 0) return

  const foodCat = cats.find(c => c.name === 'Food')
  const drinksCat = cats.find(c => c.name === 'Drinks')
  if (!foodCat || !drinksCat) return

  await supabase.from('tiers').insert(
    FOOD_TIERS.map(t => ({ ...t, user_id: userId, category_id: foodCat.id }))
  )

  await supabase.from('tiers').insert(
    DRINK_TIERS.map(t => ({ ...t, user_id: userId, category_id: drinksCat.id }))
  )
}
