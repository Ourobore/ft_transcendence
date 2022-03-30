import type { Channel } from './channel.model'

export interface User {
  id: number;
  username: string;
  avatar?: string;
  ownerChannels: Channel[];
  adminChannels: Channel[];
  memberChannels: Channel[];
  muteChannels: Channel[];
  banChannels: Channel[];
  inviteChannels: Channel[];
}
