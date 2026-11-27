import { createContext, useContext } from 'react'

export const CreationLoginContext = createContext(() => {})

export function useCreationLogin() {
  return useContext(CreationLoginContext)
}
