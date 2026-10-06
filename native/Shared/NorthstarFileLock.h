#ifndef NORTHSTAR_FILE_LOCK_H
#define NORTHSTAR_FILE_LOCK_H

// Avoid Swift's collision between the POSIX function and struct named flock.
int NorthstarFlock(int descriptor, int operation);

#endif
