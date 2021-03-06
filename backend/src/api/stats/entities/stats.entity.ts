import {
  PrimaryColumn,
  Column,
  Entity,
  OneToOne,
  PrimaryGeneratedColumn,
  JoinColumn,
} from 'typeorm';
import User from 'src/api/users/entities/user.entity';

@Entity()
class Stats {
  @PrimaryGeneratedColumn()
  public id: number;

  @OneToOne((type) => User, (user) => user.stats, {
    cascade: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  public user: User;

  @Column()
  public played: number;

  @Column()
  public win: number;

  @Column()
  public lose: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  public ratio: number;
}

export default Stats;
