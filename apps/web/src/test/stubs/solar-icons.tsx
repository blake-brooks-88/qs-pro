import type { SVGProps } from "react";

type SolarIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  weight?: string;
};

function createIcon(displayName: string) {
  function Icon({ size = 24, weight: _weight, ...props }: SolarIconProps) {
    return (
      <svg
        aria-hidden="true"
        focusable="false"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        {...props}
      />
    );
  }

  Icon.displayName = displayName;
  return Icon;
}

export const AddCircle = createIcon("AddCircle");
export const AddFolder = createIcon("AddFolder");
export const AltArrowDown = createIcon("AltArrowDown");
export const AltArrowLeft = createIcon("AltArrowLeft");
export const AltArrowRight = createIcon("AltArrowRight");
export const AltArrowUp = createIcon("AltArrowUp");
export const CheckCircle = createIcon("CheckCircle");
export const ClockCircle = createIcon("ClockCircle");
export const CloseCircle = createIcon("CloseCircle");
export const CloseSquare = createIcon("CloseSquare");
export const Code = createIcon("Code");
export const CodeFile = createIcon("CodeFile");
export const Copy = createIcon("Copy");
export const CrownStar = createIcon("CrownStar");
export const Danger = createIcon("Danger");
export const DangerCircle = createIcon("DangerCircle");
export const DangerTriangle = createIcon("DangerTriangle");
export const Database = createIcon("Database");
export const Diskette = createIcon("Diskette");
export const DocumentAdd = createIcon("DocumentAdd");
export const DoubleAltArrowLeft = createIcon("DoubleAltArrowLeft");
export const DoubleAltArrowRight = createIcon("DoubleAltArrowRight");
export const Download = createIcon("Download");
export const Export = createIcon("Export");
export const Folder = createIcon("Folder");
export const Folder2 = createIcon("Folder2");
export const History = createIcon("History");
export const Import = createIcon("Import");
export const InfoCircle = createIcon("InfoCircle");
export const LinkBrokenMinimalistic = createIcon("LinkBrokenMinimalistic");
export const LinkCircle = createIcon("LinkCircle");
export const LinkMinimalistic = createIcon("LinkMinimalistic");
export const LockKeyhole = createIcon("LockKeyhole");
export const Magnifer = createIcon("Magnifer");
export const MenuDots = createIcon("MenuDots");
export const Moon = createIcon("Moon");
export const Pen = createIcon("Pen");
export const Play = createIcon("Play");
export const RefreshCircle = createIcon("RefreshCircle");
export const RestartCircle = createIcon("RestartCircle");
export const Rocket = createIcon("Rocket");
export const SortVertical = createIcon("SortVertical");
export const Sun = createIcon("Sun");
export const TrashBinMinimalistic = createIcon("TrashBinMinimalistic");
export const TrashBinTrash = createIcon("TrashBinTrash");
export const UsersGroupRounded = createIcon("UsersGroupRounded");
