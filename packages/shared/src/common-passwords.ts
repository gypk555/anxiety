/**
 * A curated list of passwords that people really use, kept here so that no third party ever sees a password
 * being checked. Only entries long enough to pass the 10-character minimum are worth listing. Lower case: the
 * check lower-cases first. Add to it freely; nothing depends on its order. The list ships in the lazy chunks of the
 * screens that set a password, and in the server, and stays out of the first bundle. It is hand-picked, not a breach corpus: see docs/SECURITY-EXCEPTIONS.md.
 */
const LIST = `
1234567890 12345678910 123456789012 1234567891 0123456789 0987654321 9876543210 1122334455 1111111111 0000000000
1212121212 1234512345 1234554321 123123123123 1231231234 111222333444 1q2w3e4r5t 1q2w3e4r5t6y 1qaz2wsx3edc 1qazxsw23edc
q1w2e3r4t5 q1w2e3r4t5y6 a1b2c3d4e5 a1b2c3d4e5f6 qwertyuiop qwertyuiop123 qwerty12345 qwerty123456 qwerty1234 qweasdzxc123
qazwsxedc123 qazwsxedcrfv asdfghjkl1 asdfghjkl123 asdfghjkl; zxcvbnm123 zxcvbnm1234 zaq12wsx3edc 1234qwer1234 123qweasdzxc
abcdefghij abcdefghijk abcdefghijkl abcd123456 abcd1234567 abc123456789 abcdefg12345 password12 password123 password1234
password12345 password123456 password1! password123! password@1 password@12 password@123 password@1234 password#123 p@ssw0rd123
p@ssword123 passw0rd123 pa55word123 pass@12345 pass@123456 pass12345678 passwordpassword mypassword mypassword1 mypassword123
newpassword newpassword1 newpassword123 changeme123 changeme1234 changemenow letmein1234 letmein12345 letmeinnow welcome123
welcome1234 welcome12345 welcome@123 welcome@1234 welcome#123 welcome2024 welcome2025 welcome2026 admin12345 admin123456
admin@12345 admin@123456 administrator administrator1 root123456 superman123 superman1234 batman12345 spiderman1 spiderman123
iloveyou12 iloveyou123 iloveyou1234 iloveyou!! iloveyou2 iloveyouforever iloveindia iloveindia1 iloveindia123 ilovemymom
ilovemymother ilovemyfamily ilovemyself ilovemydad ilovemyindia loveyouforever loveyou123 lovelove12 sunshine12 sunshine123
sunshine1234 princess12 princess123 princess1234 football12 football123 football1234 baseball12 baseball123 basketball
basketball1 basketball123 cricket123 cricket1234 cricket@123 sachin1234 sachin12345 sachintendulkar viratkohli viratkohli18
viratkohli123 dhoni12345 msdhoni007 msdhoni123 mahendrasingh rohitsharma krishna123 krishna1234 krishna@123 harekrishna
harekrishna1 jaishriram jaishreeram jaishriram1 jaisriram123 jaihanuman jaibajrangbali omnamahshivaya omnamahshivay
omsairam123 saibaba1234 saibaba123 sairam12345 ganesh12345 ganesha1234 shivshakti lakshmi1234 hanuman1234 waheguru123
allahakbar786 bismillah786 bismillah123 mashaallah786 yaalimadad jesuschrist jesus12345 jesuslovesme jesus1234 india12345
india123456 india@1234 india@12345 india@123456 incredibleindia hindustan123 hindustan1947 bharat1234 bharat12345
jaihind1234 mumbai12345 mumbai@1234 delhi123456 delhi@12345 bangalore1 bangalore123 bengaluru1 bengaluru123 hyderabad1
hyderabad123 chennai1234 chennai12345 kolkata1234 pune@123456 lucknow1234 ahmedabad1 ahmedabad123 kerala12345 punjab12345
rajasthan1 maharashtra tamilnadu1 tamilnadu123 karnataka1 karnataka123 telangana1 mummypapa12 mummypapa123 mummydaddy
mamapapa123 mylovemom1 mybaby12345 mysweetheart sweetheart1 sweetheart123 monkey12345 dragon12345 shadow12345 master12345
michael123 jennifer123 jessica123 charlie123 charlie1234 ashley12345 daniel12345 matthew123 andrew12345 thomas12345 robert12345
joshua12345 anthony123 pokemon1234 pokemon12345 starwars12 starwars123 trustno1234 whatever12 whatever123 computer12
computer123 computer1234 internet12 internet123 facebook12 facebook123 facebook1234 google1234 google12345 instagram1
instagram123 whatsapp12 whatsapp123 youtube1234 youtube12345 samsung123 samsung1234 samsung12345 iphone1234 iphone12345
nokia123456 motorola123 microsoft1 microsoft123 windows123 windows1234 linkedin123 twitter123 twitter1234 linkedin1234
summer2024 summer2025 summer2026 winter2024 winter2025 winter2026 spring2025 spring2026 autumn2025 autumn2026 january2025
december2025 monday12345 friday12345 happy12345 happy123456 happiness1 happiness123 happydays1 helloworld helloworld1
helloworld123 hello12345 hello123456 goodmorning goodmorning1 goodluck123 godisgreat godisgreat1 godisgood1 godisgood123
thankyou123 thankgod123 nothing1234 nopassword nopassword1 secret12345 secret123456 topsecret1 topsecret123 mysecret123
testtest12 testing1234 testing12345 test123456 test1234567 test@12345 demo123456 guest12345 guest123456 user123456
user@12345 username1 username123 default123 default1234 temp123456 temporary1 temporary123 student123 student1234 student@123
teacher123 teacher1234 doctor12345 engineer12 engineer123 software123 developer1 developer123 manager123 manager1234
company123 company1234 business123 office12345 service123 support123 support1234 customer123 security123 security1234
freedom123 freedom1234 liberty1234 peace12345 forever123 forever1234 together12 familyfirst family12345 family123456
mothers1234 father12345 brother1234 sister12345 husband123 wifey12345 myfamily123 mylife12345 myname12345 lovely1234 lovely12345
beautiful1 beautiful12 beautiful123 gorgeous123 handsome123 handsome1234 prettygirl prettygirl1 sweetgirl1 cutegirl123
badboy1234 goodboy1234 rockstar123 rockstar1234 killer12345 hunter12345 tigers12345 lionking123 harrypotter harrypotter1
blackberry bluesky1234 greenday123 redapple123 chocolate1 chocolate12 chocolate123 strawberry strawberry1 pineapple1
pineapple123 butterfly1 butterfly12 butterfly123 dragonball1 naruto12345 alexander1 alexander12 christopher elizabeth1
correcthorsebatterystaple thequickbrownfox letmeinplease pleaseletmein
opensesame1 abracadabra aaaaaa11111 aa123456789 asd123456789 abc@12345 abc@123456 abc123456 abc1234567 abcd@1234 abcd@12345
`;

/** The phrases with spaces come out as one entry each here, so that splitting on whitespace does not lose them. */
const PHRASES = ['correct horse battery staple', 'the quick brown fox', 'i love you forever', 'jai shri ram', 'jai shree ram', 'om namah shivaya', 'password password'];

const COMMON: ReadonlySet<string> = /*#__PURE__*/ new Set([...LIST.split(/\s+/).filter(Boolean), ...PHRASES]);

/** Words that stay common however many digits or symbols are put around them. */
const BASES: ReadonlySet<string> = /*#__PURE__*/ new Set([
  'password', 'passwd', 'passw', 'pass', 'qwerty', 'qwertyuiop', 'asdfgh', 'asdfghjkl', 'zxcvbn', 'zxcvbnm', 'iloveyou', 'iloveindia', 'welcome', 'admin', 'administrator',
  'letmein', 'changeme', 'india', 'bharat', 'hindustan', 'abc', 'abcd', 'abcdef', 'test', 'testing', 'user', 'guest', 'root', 'login', 'secret', 'krishna', 'sairam', 'saibaba', 'jaishriram', 'jaishreeram',
]);

const SEQUENCES = ['abcdefghijklmnopqrstuvwxyz', '01234567890', 'qwertyuiopasdfghjklzxcvbnm'];
const isSequence = (value: string) => SEQUENCES.some((run) => run.includes(value) || [...run].reverse().join('').includes(value));

const leet = (value: string) => value.replace(/[@4]/g, 'a').replace(/0/g, 'o').replace(/[$5]/g, 's').replace(/[1!]/g, 'i').replace(/3/g, 'e');

export function isCommonPassword(password: string): boolean {
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || COMMON.has(lower.trim())) return true;
  // One or two distinct characters over and over: aaaaaaaaaa, abababab, 🌊🌊🌊.
  if (new Set(lower).size <= 2) return true;
  if (isSequence(lower)) return true;
  const stripped = lower.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
  return BASES.has(stripped) || BASES.has(leet(stripped));
}
