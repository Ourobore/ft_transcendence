/* eslint-disable @typescript-eslint/no-unused-vars */
import Channel from 'src/api/channels/entities/channel.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import User from './user.entity';

@Entity()
class MutedUser {
  @ManyToOne((type) => User, (user) => user.muteChannels, {
    primary: true,
    onDelete: 'CASCADE',
  })
  public user: User;

  @ManyToOne((type) => Channel, (channel) => channel.mutes, {
    onDelete: 'CASCADE',
  })
  public channel: Channel;

  @CreateDateColumn({ type: 'timestamptz', nullable: false })
  public date: Date;

  @Column({ type: 'time', nullable: true })
  public time?: string;
}

export default MutedUser;