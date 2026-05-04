type TrashButtonProps = {
  ariaLabel: string;
  onClick: () => void;
};

export const TrashButton = ({ ariaLabel, onClick }: TrashButtonProps) => (
  <button
    aria-label={ariaLabel}
    className="button-icon button-icon--danger"
    type="button"
    onClick={onClick}
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      width="22"
      height="22"
    >
      <path
        strokeLinecap="round"
        d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"
      />
    </svg>
  </button>
);
