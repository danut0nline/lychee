export type User = {
  id: string;
  username: string;
};

export type Session = {
  id: string;
  userId: string;
  expiresAt: Date;
};
