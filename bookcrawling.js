const crypto = require('crypto');
const axios = require('axios');
const oracledb = require('oracledb');
const path = require('path');
const { URL } = require('url');
const fs = require('fs').promises;

const query = '재료역학';
const url = `https://openapi.naver.com/v1/search/book.json?query=${query}&display=3`;
const headers = {
    'GET': "/v1/search/book.xml?query=%EC%A3%BC%EC%8B%9D&display=10&start=1 HTTP/1.1",
    'Host': "openapi.naver.com",
    'User-Agent': "curl/7.49.1",
    'Accept': "*/*",
    'X-Naver-Client-Id': "네이버API ID입력",
    'X-Naver-Client-Secret': "Secret 입력"
};

// Oracle 데이터베이스 연결 정보
const connectionConfig = {
    user: 'blank', // DB 유저네임 입력
    password: 'blank', //user password 입력
    hconnectString: "@localhost:1521/orcl"
};

async function yourFunction() {
    const response = await axios.get(url, { headers });
    const jsonData = JSON.stringify(response.data, null, 2);
    await fs.writeFile('search_result.json', jsonData);
    const jsonbook = JSON.parse(jsonData);



    const books = jsonbook.items;
    console.log(books);

    try {
        // Oracle 데이터베이스에 연결
        connection = await oracledb.getConnection(connectionConfig);

        // JSON 데이터를 SQL 쿼리에 대입하여 실행
        for (const book of books) {

            const sql = `
            INSERT INTO t_shopping_goods (
                goods_id,
                goods_sort,
                goods_title,
                goods_writer,
                goods_publisher,
                goods_price,
                goods_sales_price,
                goods_point,
                goods_published_date,
                goods_total_page,
                goods_isbn,
                goods_delivery_price,
				goods_delivery_date,
                goods_status,

                goods_publisher_comment,
                goods_recommendation,
                goods_contents_order
            ) VALUES (
                SEQ_GOODS_ID.NEXTVAL,
                :sort,
                :title,
                :author,
                :publisher,
                :price,
                :sales_price,
                :point,
                TO_DATE(:published_date, 'YYYYMMDD'),
                :totalpage,
                :isbn,
                :delivery_price,
				TO_DATE(:delivery_date, 'YYYYMMDD'),
                :status,
                :publisher_comment,
                SUBSTR(:recommendation,1,1800),
                :contents_order
            )
            RETURNING goods_id INTO :inserted_goods_id`;

            const imageInsertSql = `
        INSERT INTO t_goods_detail_image (
          image_id,
          goods_id,
          fileName,
          fileType,
          reg_id
        ) VALUES (
          SEQ_IMAGE_ID.NEXTVAL,
          :goods_id,
          :fileName,
          'main_image',
          :reg_id
        )
      `;

            const slicedrecommendation = book.description.substring(0, 1800);

            // 책 정보를 바인딩하여 쿼리 실행
            const result = await connection.execute(sql, {
                sort: "공학",
                title: book.title,
                author: book.author,
                publisher: book.publisher,
                price: book.discount,  // 아마도 'price' 대신 'discount'를 사용해야 할 것 같습니다. 필요에 따라 수정하세요.
                sales_price: book.discount,  // 동일한 값 사용 예시, 필요에 따라 수정하세요.
                point: book.discount * 0.1,  // 예시로 0으로 설정, 필요에 따라 수정하세요.
                published_date: book.pubdate,
                totalpage: 300,
                isbn: book.isbn,
                delivery_price: 0,
                delivery_date: book.pubdate,
                status: "newbook",
                publisher_comment: "",
                recommendation: slicedrecommendation,
                // recommendation: book.description,
                contents_order: 0,  // 예시로 0으로 설정, 필요에 따라 수정하세요.
                inserted_goods_id: { type: oracledb.STRING, dir: oracledb.BIND_OUT } // 바인딩 추가
            }, { autoCommit: true });

            console.log("Inserted goods_id:", result.outBinds.inserted_goods_id);
            const insertedGoodsId = Array.isArray(result.outBinds.inserted_goods_id)
                ? result.outBinds.inserted_goods_id[0]
                : result.outBinds.inserted_goods_id;


            // 이미지 URL 가져오기 (예시)
            const imageUrl = book.image; // 이 부분을 실제 이미지 URL로 바꿔주세요

            // 이미지 응답 받아오기
            const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            const imageFileName = crypto.randomBytes(4).toString('hex').slice(0, 8) + '.jpg'; // 8글자의 16진수 난수 생성
            const directoryPath = path.join('C:\\shopping\\file_repo', String(insertedGoodsId));

            const imagePath = path.join(directoryPath, imageFileName);

            try {
                // 디렉토리가 없으면 생성
                await fs.mkdir(directoryPath, { recursive: true });

                // 이미지 데이터를 파일에 쓰기
                await fs.writeFile(imagePath, Buffer.from(imageResponse.data, 'binary'));

                console.log("이미지 삽입 완료:", imageFileName);
                console.log("삽입된 행 수:", result.rowsAffected);
            } catch (error) {
                console.error("이미지 파일 쓰기 오류:", error);
            }

            await connection.execute(imageInsertSql, {
                goods_id: insertedGoodsId,
                fileName: imageFileName,
                reg_id: 'admin',  // 적절한 사용자 ID로 변경
            }, { autoCommit: true });

            console.log("Image inserted:", imageFileName);
            console.log("Rows inserted:", result.rowsAffected);

            const isUTF8Encoded = isUTF8(imageFileName);
            console.log('Is UTF-8 Encoded:', isUTF8Encoded);

        }

        // 쿼리 실행 결과 확인

        // 트랜잭션 커밋
        // await connection.commit();

    } catch (error) {
        // 에러 발생 시 롤백
        if (connection) {
            await connection.rollback();
        }

        // 에러 처리
        console.error("Error inserting data:", error);
    } finally {
        // 연결 종료
        if (connection) {
            await connection.close();
        }
    }
}

yourFunction()
