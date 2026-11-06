import { useDevice } from '@/lib/contexts/device-context';

export function useIsMobile() {
  const { isMobile } = useDevice();
  return isMobile;
}

export { useDevice };
