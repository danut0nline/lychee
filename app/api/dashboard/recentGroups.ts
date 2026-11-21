import {
  getRecentGroups as readRecentGroups,
  saveRecentGroup,
} from '@/lib/store';

type RecentGroup = {
  username: string;
  groupId: string;
  lastUsed: Date;
};

export const getRecentGroups = async (
  username: string
): Promise<RecentGroup[]> => {
  return (await readRecentGroups(username)).map((group) => ({
    username: group.username,
    groupId: group.groupId,
    lastUsed: new Date(group.lastUsed),
  }));
};

export const addRecentGroup = async (
  username: string,
  groupId: string
): Promise<void> => {
  await saveRecentGroup(username, groupId);
};
