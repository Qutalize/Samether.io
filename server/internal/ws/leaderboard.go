package ws

import (
	"bufio"
	"fmt"
	"net"
	"strconv"
	"strings"
)

type LeaderboardStore interface {
	Top() (name string, score int, ok bool)
	MaybeUpdate(name string, score int) bool
}

type inMemoryLeaderboard struct {
	topName  string
	topScore int
	has      bool
}

func NewInMemoryLeaderboard() LeaderboardStore {
	return &inMemoryLeaderboard{}
}

func (l *inMemoryLeaderboard) Top() (string, int, bool) {
	return l.topName, l.topScore, l.has
}

func (l *inMemoryLeaderboard) MaybeUpdate(name string, score int) bool {
	if name == "" {
		return false
	}
	if !l.has || score > l.topScore || name == l.topName {
		changed := !l.has || l.topName != name || l.topScore != score
		l.topName = name
		l.topScore = score
		l.has = true
		return changed
	}
	return false
}

type redisLeaderboard struct {
	address  string
	password string
	db       int
	zkey     string
	hkey     string
}

func NewRedisLeaderboard(addr, password string, db int, prefix string) (LeaderboardStore, error) {
	if addr == "" {
		return nil, fmt.Errorf("redis address is empty")
	}
	if prefix == "" {
		prefix = "samezario:leaderboard"
	}
	store := &redisLeaderboard{
		address:  addr,
		password: password,
		db:       db,
		zkey:     prefix + ":scores",
		hkey:     prefix + ":names",
	}
	if err := store.ping(); err != nil {
		return nil, err
	}
	return store, nil
}

func (r *redisLeaderboard) ping() error {
	conn, err := net.Dial("tcp", r.address)
	if err != nil {
		return err
	}
	defer conn.Close()

	if r.password != "" {
		if err := r.writeCommand(conn, "AUTH", r.password); err != nil {
			return err
		}
		if line, err := bufio.NewReader(conn).ReadString('\n'); err != nil {
			return err
		} else if !strings.HasPrefix(line, "+OK") {
			return fmt.Errorf("redis auth failed: %s", line)
		}
	}

	if r.db != 0 {
		if err := r.writeCommand(conn, "SELECT", strconv.Itoa(r.db)); err != nil {
			return err
		}
		if line, err := bufio.NewReader(conn).ReadString('\n'); err != nil {
			return err
		} else if !strings.HasPrefix(line, "+OK") {
			return fmt.Errorf("redis select failed: %s", line)
		}
	}

	if err := r.writeCommand(conn, "PING"); err != nil {
		return err
	}
	line, err := bufio.NewReader(conn).ReadString('\n')
	if err != nil {
		return err
	}
	if !strings.HasPrefix(line, "+PONG") {
		return fmt.Errorf("unexpected redis ping response: %s", line)
	}
	return nil
}

func (r *redisLeaderboard) Top() (string, int, bool) {
	cmd := fmt.Sprintf("*4\r\n$9\r\nZREVRANGE\r\n$%d\r\n%s\r\n$1\r\n0\r\n$1\r\n0\r\n$10\r\nWITHSCORES\r\n", len(r.zkey), r.zkey)
	reply, err := r.sendRawCommand(cmd)
	if err != nil || len(reply) < 2 {
		return "", 0, false
	}
	member := reply[0]
	score, err := strconv.Atoi(reply[1])
	if err != nil {
		return "", 0, false
	}
	name, err := r.hget(member)
	if err != nil {
		name = member
	}
	return name, score, true
}

func (r *redisLeaderboard) MaybeUpdate(name string, score int) bool {
	if name == "" {
		return false
	}
	current, err := r.zscore(name)
	if err == nil && current >= float64(score) {
		return false
	}
	if err := r.zadd(name, score); err != nil {
		return false
	}
	_ = r.hset(name, name)
	return true
}

func (r *redisLeaderboard) zscore(member string) (float64, error) {
	cmd := fmt.Sprintf("*3\r\n$6\r\nZSCORE\r\n$%d\r\n%s\r\n$%d\r\n%s\r\n", len(r.zkey), r.zkey, len(member), member)
	reply, err := r.sendRawCommand(cmd)
	if err != nil {
		return 0, err
	}
	return strconv.ParseFloat(reply[0], 64)
}

func (r *redisLeaderboard) zadd(member string, score int) error {
	scoreStr := strconv.Itoa(score)
	cmd := fmt.Sprintf("*4\r\n$4\r\nZADD\r\n$%d\r\n%s\r\n$%d\r\n%s\r\n$%d\r\n%s\r\n", len(r.zkey), r.zkey, len(scoreStr), scoreStr, len(member), member)
	_, err := r.sendRawCommand(cmd)
	return err
}

func (r *redisLeaderboard) hset(member, name string) error {
	cmd := fmt.Sprintf("*4\r\n$4\r\nHSET\r\n$%d\r\n%s\r\n$%d\r\n%s\r\n$%d\r\n%s\r\n", len(r.hkey), r.hkey, len(member), member, len(name), name)
	_, err := r.sendRawCommand(cmd)
	return err
}

func (r *redisLeaderboard) hget(member string) (string, error) {
	cmd := fmt.Sprintf("*3\r\n$4\r\nHGET\r\n$%d\r\n%s\r\n$%d\r\n%s\r\n", len(r.hkey), r.hkey, len(member), member)
	reply, err := r.sendRawCommand(cmd)
	if err != nil {
		return "", err
	}
	return reply[0], nil
}

func (r *redisLeaderboard) writeCommand(conn net.Conn, cmd string, args ...string) error {
	if _, err := conn.Write([]byte(fmt.Sprintf("*%d\r\n$%d\r\n%s\r\n", len(args)+1, len(cmd), cmd))); err != nil {
		return err
	}
	for _, arg := range args {
		if _, err := conn.Write([]byte(fmt.Sprintf("$%d\r\n%s\r\n", len(arg), arg))); err != nil {
			return err
		}
	}
	return nil
}

func (r *redisLeaderboard) sendRawCommand(cmd string) ([]string, error) {
	conn, err := net.Dial("tcp", r.address)
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	if _, err := conn.Write([]byte(cmd)); err != nil {
		return nil, err
	}

	reader := bufio.NewReader(conn)
	line, err := reader.ReadString('\n')
	if err != nil {
		return nil, err
	}

	switch line[0] {
	case '+':
		return []string{strings.TrimSpace(line[1:])}, nil
	case ':':
		return []string{strings.TrimSpace(line[1:])}, nil
	case '$':
		length, _ := strconv.Atoi(strings.TrimSpace(line[1:]))
		if length < 0 {
			return nil, fmt.Errorf("nil response")
		}
		buf := make([]byte, length+2)
		if _, err := reader.Read(buf); err != nil {
			return nil, err
		}
		return []string{string(buf[:length])}, nil
	case '*':
		count, _ := strconv.Atoi(strings.TrimSpace(line[1:]))
		if count <= 0 {
			return nil, nil
		}
		result := make([]string, 0, count)
		for i := 0; i < count; i++ {
			header, err := reader.ReadString('\n')
			if err != nil {
				return nil, err
			}
			if header == "\r\n" {
				i--
				continue
			}
			if header[0] != '$' {
				return nil, fmt.Errorf("unexpected array item header: %s", header)
			}
			length, _ := strconv.Atoi(strings.TrimSpace(header[1:]))
			if length < 0 {
				result = append(result, "")
				continue
			}
			buf := make([]byte, length+2)
			if _, err := reader.Read(buf); err != nil {
				return nil, err
			}
			result = append(result, string(buf[:length]))
		}
		return result, nil
	case '-':
		return nil, fmt.Errorf("redis error: %s", strings.TrimSpace(line[1:]))
	default:
		return nil, fmt.Errorf("unexpected redis response: %s", line)
	}
}
