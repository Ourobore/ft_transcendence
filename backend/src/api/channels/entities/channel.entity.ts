import {
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import User from 'src/api/users/entities/user.entity';
import Message from 'src/api/messages/entities/message.entity';

@Entity()
class Channel {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column()
  public name: string;

  @Column({ nullable: true, default: false })
  public isPrivate: boolean;

  @Column({ nullable: true })
  public password: string;

  @OneToMany((type) => Message, (message) => message.channel, {
    cascade: true,
  })
  public messages: Message[];

  @ManyToOne((type) => User, (user) => user.ownerChannels, {
    cascade: true,
  })
  public owner: User;

  @ManyToMany((type) => User, (admin) => admin.adminChannels, {
    cascade: true,
  })
  @JoinTable()
  public admins: User[];

  @ManyToMany((type) => User, (user) => user.memberChannels, {
    cascade: true,
  })
  @JoinTable()
  public members: User[];

  @ManyToMany((type) => User, (bans) => bans.muteChannels, {
    cascade: true,
  })
  @JoinTable()
  public mutes: User[];

  @ManyToMany((type) => User, (bans) => bans.banChannels, {
    cascade: true,
  })
  @JoinTable()
  public bans: User[];
}

export default Channel;
