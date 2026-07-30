import { type FC } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  AlertCircleIcon,
  AlertDiamondIcon,
  AlbumIcon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  Clock01Icon,
  CloudFogIcon,
  CloudIcon,
  CloudLightningIcon,
  CloudRainIcon,
  CloudSnowIcon,
  Delete01Icon,
  HeartIcon,
  House01Icon,
  LibraryIcon,
  ListMusicIcon,
  ListPlusIcon,
  Logout01Icon,
  Maximize01Icon,
  Minimize01Icon,
  Moon01Icon,
  MoonCloudIcon,
  MusicNote01Icon,
  MusicNote02Icon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PlusSignIcon,
  PreviousIcon,
  RepeatIcon,
  RepeatOne01Icon,
  Search01Icon,
  Share01Icon,
  ShuffleIcon,
  SparklesIcon,
  Sun01Icon,
  SunCloud01Icon,
  UserAdd01Icon,
  UserCheck01Icon,
  UserIcon,
  VolumeMute01Icon,
  VolumeUpIcon,
  WifiOff01Icon,
  ZapIcon,
} from '@hugeicons/core-free-icons';

type IconProps = { size?: number; color?: string; strokeWidth?: number };

function createIcon(component: any): FC<IconProps> {
  const C: FC<IconProps> = (props) => <HugeiconsIcon icon={component} {...props} />;
  return C;
}

export const AlertCircle = createIcon(AlertCircleIcon);
export const AlertTriangle = createIcon(AlertDiamondIcon);
export const Album = createIcon(AlbumIcon);
export const Check = createIcon(CheckmarkCircle01Icon);
export const ChevronDown = createIcon(ChevronDownIcon);
export const ChevronLeft = createIcon(ChevronLeftIcon);
export const ChevronRight = createIcon(ChevronRightIcon);
export const ChevronUp = createIcon(ChevronUpIcon);
export const Clock = createIcon(Clock01Icon);
export const Cloud = createIcon(CloudIcon);
export const CloudFog = createIcon(CloudFogIcon);
export const CloudLightning = createIcon(CloudLightningIcon);
export const CloudMoon = createIcon(MoonCloudIcon);
export const CloudRain = createIcon(CloudRainIcon);
export const CloudSnow = createIcon(CloudSnowIcon);
export const CloudSun = createIcon(SunCloud01Icon);
export const Heart = createIcon(HeartIcon);
export const House = createIcon(House01Icon);
export const Library = createIcon(LibraryIcon);
export const ListMusic = createIcon(ListMusicIcon);
export const ListPlus = createIcon(ListPlusIcon);
export const LogOut = createIcon(Logout01Icon);
export const Maximize2 = createIcon(Maximize01Icon);
export const Minimize2 = createIcon(Minimize01Icon);
export const Moon = createIcon(Moon01Icon);
export const Music = createIcon(MusicNote01Icon);
export const Music2 = createIcon(MusicNote02Icon);
export const Pause = createIcon(PauseIcon);
export const Play = createIcon(PlayIcon);
export const Plus = createIcon(PlusSignIcon);
export const Repeat = createIcon(RepeatIcon);
export const Repeat1 = createIcon(RepeatOne01Icon);
export const Search = createIcon(Search01Icon);
export const Share2 = createIcon(Share01Icon);
export const Shuffle = createIcon(ShuffleIcon);
export const SkipBack = createIcon(PreviousIcon);
export const SkipForward = createIcon(NextIcon);
export const Sparkles = createIcon(SparklesIcon);
export const Sun = createIcon(Sun01Icon);
export const Trash2 = createIcon(Delete01Icon);
export const User = createIcon(UserIcon);
export const UserCheck = createIcon(UserCheck01Icon);
export const UserPlus = createIcon(UserAdd01Icon);
export const Volume2 = createIcon(VolumeUpIcon);
export const VolumeX = createIcon(VolumeMute01Icon);
export const WifiOff = createIcon(WifiOff01Icon);
export const X = createIcon(Cancel01Icon);
export const Zap = createIcon(ZapIcon);
